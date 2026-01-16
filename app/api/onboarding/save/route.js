import { NextResponse } from "next/server";
import { auth } from "@/libs/auth";
import { supabaseAdmin } from "@/libs/supabase";

export async function POST(req) {
  try {
    const session = await auth();
    
    // Dev mode: Allow bypassing authentication in development or prelaunch
    // Check both NODE_ENV and allow prelaunch environment
    const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'prelaunch';
    let userId = session?.user?.id;
    
    if (!userId && isDev) {
      // In dev mode, get or create a dev test user
      const devEmail = 'appmarkrai@gmail.com';
      
      // Check if dev user exists
      let { data: devUser, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('id, email, name')
        .eq('email', devEmail)
        .maybeSingle(); // Use maybeSingle instead of single to avoid errors if not found
      
      if (!devUser && (!fetchError || fetchError.code === 'PGRST116')) {
        // User doesn't exist, create it
        try {
          const { data: newUser, error: createError } = await supabaseAdmin
            .from('users')
            .insert({
              email: devEmail,
              name: 'Dev Test User',
              email_verified: new Date().toISOString(),
              has_completed_onboarding: false
            })
            .select('id, email, name')
            .single();
          
          if (createError) {
            console.error('❌ Error creating dev user:', createError);
            // Try to fetch again in case it was created by another request
            const { data: retryUser } = await supabaseAdmin
              .from('users')
              .select('id, email, name')
              .eq('email', devEmail)
              .maybeSingle();
            
            if (retryUser) {
              devUser = retryUser;
              console.log('✅ Dev mode: Found dev user after retry:', devUser.id);
            } else {
              return NextResponse.json(
                { 
                  error: "Failed to create dev user",
                  details: createError.message,
                  code: createError.code,
                  hint: createError.hint || "Check database permissions and constraints"
                },
                { status: 500 }
              );
            }
          } else {
            devUser = newUser;
            console.log('✅ Dev mode: Created test user:', devUser.id);
          }
        } catch (createErr) {
          console.error('❌ Exception creating dev user:', createErr);
          // Try to fetch existing user as fallback
          const { data: fallbackUser } = await supabaseAdmin
            .from('users')
            .select('id, email, name')
            .eq('email', devEmail)
            .maybeSingle();
          
          if (fallbackUser) {
            devUser = fallbackUser;
            console.log('✅ Dev mode: Found dev user on fallback:', devUser.id);
          } else {
            return NextResponse.json(
              { 
                error: "Failed to create or find dev user",
                details: createErr.message || createErr.toString()
              },
              { status: 500 }
            );
          }
        }
      } else if (devUser) {
        console.log('🔧 Dev mode: Using existing test user:', devUser.id);
      } else if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('❌ Error fetching dev user:', fetchError);
        return NextResponse.json(
          { error: "Failed to get dev user", details: fetchError.message, code: fetchError.code },
          { status: 500 }
        );
      }
      
      userId = devUser?.id;
    }
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { quizAnswers } = body;

    if (!quizAnswers) {
      return NextResponse.json(
        { error: "Quiz answers are required" },
        { status: 400 }
      );
    }

    // Extract data from quizAnswers
    const quizData = {
      q1: quizAnswers.q1,
      q2: quizAnswers.q2,
      q3: quizAnswers.q3,
      q4: quizAnswers.q4,
      q5: quizAnswers.q5,
      q6: quizAnswers.q6,
      q7: quizAnswers.q7,
      q8: quizAnswers.q8,
      referral_source: quizAnswers.referralSource,
      selected_subjects: quizAnswers.selectedSubjects,
      subject_boards: quizAnswers.subjectBoards,
      weekly_availability: quizAnswers.weeklyAvailability,
    };

    // Only mark as completed if we have all required data
    // Required: subjects, boards, ratings, availability
    const hasRequiredData = Boolean(
      (quizAnswers.selectedSubjects && quizAnswers.selectedSubjects.length > 0) &&
      quizAnswers.subjectBoards &&
      quizAnswers.topicRatings &&
      quizAnswers.weeklyAvailability
    );

    // Update user record with onboarding data
    // Try to update, but if onboarding_data column doesn't exist, just update other fields
    const updateData = {
      has_completed_onboarding: hasRequiredData
    };
    
    // Only add onboarding_data if the column exists (will fail gracefully if it doesn't)
    try {
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
          ...updateData,
          onboarding_data: quizData
      })
        .eq('id', userId);

    if (updateError) {
        // If it's a column error, try without onboarding_data
        if (updateError.message?.includes('column') || updateError.code === '42703' || updateError.message?.includes('onboarding_data')) {
          console.warn('⚠️ onboarding_data column not found, saving without it');
          const { error: simpleUpdateError } = await supabaseAdmin
            .from('users')
            .update(updateData)
            .eq('id', userId);
          
          if (simpleUpdateError) {
            throw simpleUpdateError;
          }
        } else {
          throw updateError;
        }
      }
    } catch (updateError) {
      console.error('❌ Error updating user onboarding data:', updateError);
      return NextResponse.json(
        { 
          error: "Failed to save onboarding data",
          details: updateError.message || updateError.toString(),
          code: updateError.code,
          hint: "Make sure you've run the database migrations (003_add_onboarding_columns.sql)"
        },
        { status: 500 }
      );
    }

    // Save topic ratings separately (using user_topic_confidence table)
    // Save ALL ratings including 0 (Haven't Learned) and -2 (Not Doing) so they can be viewed/updated later
    const topicRatings = quizAnswers.topicRatings || {};
    const uuidRegex = /^[0-9a-fA-F-]{36}$/;
    const ratingEntries = Object.entries(topicRatings)
      .filter(([topicId, rating]) => {
        // Only filter out invalid UUIDs and undefined/null ratings
        // Keep all valid ratings: -2, -1, 0, 1, 2, 3, 4, 5
        return uuidRegex.test(topicId) && rating !== undefined && rating !== null;
      })
      .map(([topicId, rating]) => ({
        user_id: userId,
      topic_id: topicId,
      rating: rating,
    }));

    if (ratingEntries.length > 0) {
      // Delete existing ratings first (in case user is re-doing onboarding)
      await supabaseAdmin
        .from('user_topic_confidence')
        .delete()
        .eq('user_id', userId);

      // Insert new ratings
      const { error: ratingsError } = await supabaseAdmin
        .from('user_topic_confidence')
        .insert(ratingEntries);

      if (ratingsError) {
        console.error('Error saving topic ratings:', ratingsError);
        // Don't fail the whole request if ratings fail
      }
    }

    // Save time preferences
    const timePreferences = quizAnswers.timePreferences;
    if (timePreferences) {
      try {
      const { error: timePrefError } = await supabaseAdmin
        .from('users')
        .update({
          weekday_earliest_time: timePreferences.weekdayEarliest || '4:30',
          weekday_latest_time: timePreferences.weekdayLatest || '23:30',
          weekend_earliest_time: timePreferences.weekendEarliest || null,
          weekend_latest_time: timePreferences.weekendLatest || null,
          use_same_weekend_times: timePreferences.useSameWeekendTimes !== false
        })
          .eq('id', userId);

      if (timePrefError) {
          throw timePrefError;
        }
      } catch (timePrefError) {
        if (timePrefError?.code === 'PGRST204' || timePrefError?.message?.includes('use_same_weekend_times')) {
          console.warn('⚠️ time preference columns missing, skipping update');
        } else {
        console.error('Error saving time preferences:', timePrefError);
        }
        // Don't fail the whole request if time preferences fail
      }
    }

    // Save unavailable/blocked times
    const blockedTimes = quizAnswers.blockedTimes || [];
    if (blockedTimes.length > 0) {
      try {
      // Delete existing unavailable times for the date ranges we're updating
      const dates = blockedTimes.map(bt => new Date(bt.start).toISOString().split('T')[0]);
      const minDate = new Date(Math.min(...dates.map(d => new Date(d))));
      const maxDate = new Date(Math.max(...dates.map(d => new Date(d))));
      maxDate.setDate(maxDate.getDate() + 1); // Include end date

      await supabaseAdmin
        .from('unavailable_times')
        .delete()
          .eq('user_id', userId)
        .gte('start_datetime', minDate.toISOString())
        .lt('start_datetime', maxDate.toISOString());

      // Insert new unavailable times
      const unavailableEntries = blockedTimes.map(blocked => ({
          user_id: userId,
        start_datetime: blocked.start,
        end_datetime: blocked.end,
        reason: blocked.reason || null
      }));

      const { error: unavailableError } = await supabaseAdmin
        .from('unavailable_times')
        .insert(unavailableEntries);

      if (unavailableError) {
          if (unavailableError.code === 'PGRST205' || unavailableError.message?.includes('unavailable_times')) {
            console.warn('⚠️ unavailable_times table missing, skipping blocked time save');
          } else {
            throw unavailableError;
          }
        }
      } catch (unavailableError) {
        if (unavailableError?.code === 'PGRST205' || unavailableError?.message?.includes('unavailable_times')) {
          console.warn('⚠️ unavailable_times table missing, skipping blocked time save');
        } else {
        console.error('Error saving unavailable times:', unavailableError);
        }
        // Don't fail the whole request if unavailable times fail
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving onboarding data:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

