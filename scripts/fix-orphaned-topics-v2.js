// scripts/fix-orphaned-topics-v2.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Default to dry-run mode (set DRY_RUN=false to actually make changes)
const DRY_RUN = process.env.DRY_RUN !== 'false';

// Levenshtein distance for fuzzy matching
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
}

// Normalize text for matching (lowercase, trim, remove extra spaces)
function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Calculate similarity score (0-1, higher is better)
function similarityScore(str1, str2) {
  const normalized1 = normalizeText(str1);
  const normalized2 = normalizeText(str2);
  
  if (normalized1 === normalized2) return 1.0;
  
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLen = Math.max(normalized1.length, normalized2.length);
  
  return maxLen === 0 ? 0 : 1 - (distance / maxLen);
}

// Fix encoding issues and clean up quotes
function fixEncoding(text) {
  if (!text) return text;
  return text
    .replace(/Äì/g, '–')
    .replace(/Aì/g, '–')
    .replace(/Äô/g, "'")
    .replace(/Ãô/g, "'")
    .replace(/Äò/g, "'")
    .replace(/^["']+|["']+$/g, '') // Remove surrounding quotes
    .trim();
}

// Check if a string looks like a date range (e.g., "1992–94", "1625–49", "c.1911", "1789")
function isDateRange(text) {
  if (!text) return false;
  const cleaned = text.trim().replace(/^["']+|["']+$/g, ''); // Remove surrounding quotes
  // Patterns: "1992–94", "1625–49", "c.1911", "1918–33", "1789" (single year)
  const datePattern = /^(c?\.?\s*)?\d{4}([–-]\d{2,4})?$/;
  return datePattern.test(cleaned);
}

// Extract date range from text (handles various formats)
function extractDateRange(text) {
  if (!text) return null;
  const cleaned = text.trim().replace(/^["']+|["']+$/g, ''); // Remove surrounding quotes
  // Match patterns like "1992–94", "1625–49", "c.1911", "1918–33", "1789"
  const match = cleaned.match(/(c?\.?\s*)?(\d{4})([–-](\d{2,4}))?/);
  if (match) {
    // Return the full date range (e.g., "1992–94" or just "1789")
    return match[0].replace(/^c?\.?\s*/, ''); // Remove "c." prefix if present
  }
  return null;
}

async function fixOrphanedTopics() {
  console.log('='.repeat(80));
  console.log('🔧 FIX ORPHANED TOPICS V2');
  console.log('='.repeat(80));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  LIVE (will update database)'}`);
  console.log('');

  const results = {
    fixed: [],
    failed: [],
    skipped: [],
    invalidParentIdFixed: [],
    circularRefsFixed: []
  };

  try {
    // STEP 1: Load diagnostic report if available
    console.log('📥 Step 1: Loading diagnostic data...');
    const reportDir = join(__dirname, '..', 'docs');
    let criticalTopics = [];
    
    // Try to find the most recent diagnostic report
    const reportFiles = fs.existsSync(reportDir) 
      ? fs.readdirSync(reportDir)
          .filter(f => f.startsWith('data-quality-audit-') && f.endsWith('.json'))
          .sort()
          .reverse()
      : [];
    
    if (reportFiles.length > 0) {
      const latestReport = JSON.parse(
        fs.readFileSync(join(reportDir, reportFiles[0]), 'utf8')
      );
      criticalTopics = latestReport.topicsInActiveBlocks || [];
      console.log(`  ✅ Loaded diagnostic report: ${reportFiles[0]}`);
      console.log(`  ⚠️  Found ${criticalTopics.length} critical topics (used in active blocks)`);
    } else {
      console.log('  ⚠️  No diagnostic report found, will process all orphaned topics');
    }
    console.log('');

    // STEP 2: Fetch all topics
    console.log('📊 Step 2: Fetching all topics...');
    let allTopics = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('topics')
        .select('id, spec_id, title, parent_title, level, parent_id, order_index')
        .order('spec_id')
        .order('level')
        .order('order_index')
        .range(from, from + pageSize - 1);

      if (pageError) {
        throw new Error(`Failed to fetch topics: ${pageError.message}`);
      }

      if (page && page.length > 0) {
        allTopics = allTopics.concat(page);
        from += pageSize;
        hasMore = page.length === pageSize;
        console.log(`  Fetched ${allTopics.length} topics so far...`);
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Total topics fetched: ${allTopics.length}`);
    console.log('');

    // STEP 3: Build topic maps for efficient lookup
    console.log('🗺️  Step 3: Building topic maps...');
    const topicMap = new Map(); // id -> topic
    const topicsBySpec = new Map(); // spec_id -> [topics]
    const level1BySpec = new Map(); // spec_id -> [level1 topics]
    const level2BySpec = new Map(); // spec_id -> [level2 topics]
    const level2ByParentTitle = new Map(); // normalized parent_title -> [level2 topics]
    const level2ByTitle = new Map(); // normalized title -> [level2 topics]

    allTopics.forEach(topic => {
      topicMap.set(topic.id, topic);
      
      if (!topicsBySpec.has(topic.spec_id)) {
        topicsBySpec.set(topic.spec_id, []);
      }
      topicsBySpec.get(topic.spec_id).push(topic);

      if (topic.level === 1) {
        if (!level1BySpec.has(topic.spec_id)) {
          level1BySpec.set(topic.spec_id, []);
        }
        level1BySpec.get(topic.spec_id).push(topic);
      }

      if (topic.level === 2) {
        if (!level2BySpec.has(topic.spec_id)) {
          level2BySpec.set(topic.spec_id, []);
        }
        level2BySpec.get(topic.spec_id).push(topic);

        // Index by parent_title (for level 3 matching)
        if (topic.parent_title) {
          const key = normalizeText(fixEncoding(topic.parent_title));
          if (!level2ByParentTitle.has(key)) {
            level2ByParentTitle.set(key, []);
          }
          level2ByParentTitle.get(key).push(topic);
        }

        // Index by title (for level 3 matching)
        const titleKey = normalizeText(fixEncoding(topic.title));
        if (!level2ByTitle.has(titleKey)) {
          level2ByTitle.set(titleKey, []);
        }
        level2ByTitle.get(titleKey).push(topic);
      }
    });

    console.log(`✅ Topic maps built`);
    console.log(`  - Total topics: ${topicMap.size}`);
    console.log(`  - Specs: ${topicsBySpec.size}`);
    console.log(`  - Level 1 topics: ${Array.from(level1BySpec.values()).flat().length}`);
    console.log(`  - Level 2 topics: ${Array.from(level2BySpec.values()).flat().length}`);
    console.log('');

    // STEP 4: Find orphaned topics
    console.log('🔍 Step 4: Finding orphaned topics...');
    const orphaned = allTopics.filter(topic => 
      (topic.level === 2 || topic.level === 3) && 
      !topic.parent_id
    );

    // Prioritize critical topics (used in active blocks)
    const criticalTopicIds = new Set(criticalTopics.map(t => t.topic_id));
    const orphanedCritical = orphaned.filter(t => criticalTopicIds.has(t.id));
    const orphanedRegular = orphaned.filter(t => !criticalTopicIds.has(t.id));

    console.log(`  Found ${orphaned.length} orphaned topics`);
    console.log(`  ⚠️  Critical (in active blocks): ${orphanedCritical.length}`);
    console.log(`  Regular: ${orphanedRegular.length}`);
    console.log('');

    // STEP 5: Fix orphaned topics (prioritize critical ones)
    console.log('🔧 Step 5: Fixing orphaned topics...');
    const topicsToFix = [...orphanedCritical, ...orphanedRegular];
    let fixed = 0;
    let failed = 0;
    let skipped = 0;

    for (const topic of topicsToFix) {
      const isCritical = criticalTopicIds.has(topic.id);
      const prefix = isCritical ? '🚨' : '  ';
      
      let parent = null;
      let matchMethod = null;
      let confidence = 0;

      if (topic.level === 2) {
        // Level 2 topics need Level 1 parent
        const level1Topics = level1BySpec.get(topic.spec_id) || [];
        
        if (topic.parent_title) {
          const fixedParentTitle = fixEncoding(topic.parent_title);
          const normalizedParentTitle = normalizeText(fixedParentTitle);
          
          // Strategy 1: Exact match on parent_title
          parent = level1Topics.find(t => 
            normalizeText(fixEncoding(t.title)) === normalizedParentTitle
          );
          if (parent) {
            matchMethod = 'exact_parent_title';
            confidence = 1.0;
          }

          // Strategy 2: Fuzzy match on parent_title
          if (!parent) {
            let bestMatch = null;
            let bestScore = 0.8; // Minimum threshold
            
            level1Topics.forEach(t => {
              const score = similarityScore(fixedParentTitle, t.title);
              if (score > bestScore) {
                bestScore = score;
                bestMatch = t;
              }
            });
            
            if (bestMatch) {
              parent = bestMatch;
              matchMethod = 'fuzzy_parent_title';
              confidence = bestScore;
            }
          }
        }

        // Strategy 3: Match by order_index proximity (if parent_title not available)
        if (!parent && topic.order_index !== null) {
          // Find closest level 1 topic by order_index
          const sortedLevel1 = level1Topics
            .filter(t => t.order_index !== null)
            .sort((a, b) => a.order_index - b.order_index);
          
          // Find level 1 topic that should contain this level 2 topic
          for (let i = 0; i < sortedLevel1.length; i++) {
            const level1 = sortedLevel1[i];
            const nextLevel1 = sortedLevel1[i + 1];
            
            if (topic.order_index >= level1.order_index && 
                (!nextLevel1 || topic.order_index < nextLevel1.order_index)) {
              parent = level1;
              matchMethod = 'order_index_proximity';
              confidence = 0.7;
              break;
            }
          }
        }
      } else if (topic.level === 3) {
        // Level 3 topics need Level 2 parent
        const level2Topics = level2BySpec.get(topic.spec_id) || [];
        
        if (topic.parent_title) {
          const fixedParentTitle = fixEncoding(topic.parent_title);
          const normalizedParentTitle = normalizeText(fixedParentTitle);
          
          // Strategy 1: Match by level 2's parent_title (date ranges)
          const candidates = level2ByParentTitle.get(normalizedParentTitle) || [];
          if (candidates.length === 1) {
            parent = candidates[0];
            matchMethod = 'level2_parent_title';
            confidence = 1.0;
          } else if (candidates.length > 1) {
            // Multiple matches - use order_index if available
            if (topic.order_index !== null) {
              const sorted = candidates
                .filter(t => t.order_index !== null)
                .sort((a, b) => a.order_index - b.order_index);
              
              // Find closest by order_index
              for (const candidate of sorted) {
                if (candidate.order_index <= topic.order_index) {
                  parent = candidate;
                  matchMethod = 'level2_parent_title_order';
                  confidence = 0.9;
                }
              }
              if (!parent && sorted.length > 0) {
                parent = sorted[0];
                matchMethod = 'level2_parent_title_order';
                confidence = 0.8;
              }
            }
          }

          // Strategy 2: Match by level 2 title
          if (!parent) {
            const titleCandidates = level2ByTitle.get(normalizedParentTitle) || [];
            if (titleCandidates.length === 1) {
              parent = titleCandidates[0];
              matchMethod = 'level2_title_exact';
              confidence = 1.0;
            }
          }

          // Strategy 3: Date range matching (for History topics)
          // If parent_title is a date range, find Level 2 topics whose title or parent_title contains it
          if (!parent) {
            const isDate = isDateRange(fixedParentTitle);
            if (isDate) {
              const dateRange = extractDateRange(fixedParentTitle);
              if (dateRange) {
                // Extract year from date range (e.g., "1992–94" -> 1992, "1789" -> 1789)
                const yearMatch = dateRange.match(/^(\d{4})/);
                const targetYear = yearMatch ? parseInt(yearMatch[1]) : null;
                
                // Search for Level 2 topics whose title or parent_title contains this date range
                const dateRangeMatches = level2Topics.filter(t => {
                  const tTitle = fixEncoding(t.title);
                  const tParentTitle = t.parent_title ? fixEncoding(t.parent_title) : '';
                  
                  // Check if title contains the date range
                  const titleContains = tTitle.includes(dateRange) || 
                         tTitle.includes(dateRange.replace('–', '-')) ||
                         tTitle.includes(dateRange.replace('-', '–'));
                  
                  // Check if parent_title contains the date range or the year
                  const parentTitleContains = tParentTitle.includes(dateRange) ||
                         tParentTitle.includes(dateRange.replace('–', '-')) ||
                         tParentTitle.includes(dateRange.replace('-', '–'));
                  
                  // Check if parent_title contains the target year (for ranges like "1955–92" containing "1992")
                  const parentTitleContainsYear = targetYear && tParentTitle.includes(targetYear.toString());
                  
                  return titleContains || parentTitleContains || parentTitleContainsYear;
                });
                
                if (dateRangeMatches.length === 1) {
                  parent = dateRangeMatches[0];
                  matchMethod = 'date_range_contained';
                  confidence = 0.95;
                } else if (dateRangeMatches.length > 1) {
                  // Multiple matches - use order_index if available
                  if (topic.order_index !== null) {
                    const sorted = dateRangeMatches
                      .filter(t => t.order_index !== null)
                      .sort((a, b) => a.order_index - b.order_index);
                    
                    // Find closest by order_index
                    for (const candidate of sorted) {
                      if (candidate.order_index <= topic.order_index) {
                        parent = candidate;
                        matchMethod = 'date_range_contained_order';
                        confidence = 0.9;
                      }
                    }
                    if (!parent && sorted.length > 0) {
                      parent = sorted[0];
                      matchMethod = 'date_range_contained_order';
                      confidence = 0.85;
                    }
                  } else {
                    // No order_index - take first match
                    parent = dateRangeMatches[0];
                    matchMethod = 'date_range_contained_multiple';
                    confidence = 0.8;
                  }
                }
              }
            }
          }

          // Strategy 4: Fuzzy match on level 2 title
          if (!parent) {
            let bestMatch = null;
            let bestScore = 0.8;
            
            level2Topics.forEach(t => {
              const score = similarityScore(fixedParentTitle, t.title);
              if (score > bestScore) {
                bestScore = score;
                bestMatch = t;
              }
            });
            
            if (bestMatch) {
              parent = bestMatch;
              matchMethod = 'level2_title_fuzzy';
              confidence = bestScore;
            }
          }
        }
      }

      if (parent && confidence >= 0.7) {
        if (!DRY_RUN) {
          const { error } = await supabase
            .from('topics')
            .update({ parent_id: parent.id })
            .eq('id', topic.id);

          if (error) {
            console.error(`${prefix} ❌ Failed to fix "${topic.title}": ${error.message}`);
            results.failed.push({
              topic_id: topic.id,
              topic_title: topic.title,
              level: topic.level,
              error: error.message
            });
            failed++;
          } else {
            console.log(`${prefix} ✅ Fixed "${topic.title}" → "${parent.title}" (${matchMethod}, confidence: ${(confidence * 100).toFixed(0)}%)`);
            results.fixed.push({
              topic_id: topic.id,
              topic_title: topic.title,
              level: topic.level,
              parent_id: parent.id,
              parent_title: parent.title,
              match_method: matchMethod,
              confidence: confidence,
              is_critical: isCritical
            });
            fixed++;
          }
        } else {
          console.log(`${prefix} ✅ Would fix "${topic.title}" → "${parent.title}" (${matchMethod}, confidence: ${(confidence * 100).toFixed(0)}%)`);
          results.fixed.push({
            topic_id: topic.id,
            topic_title: topic.title,
            level: topic.level,
            parent_id: parent.id,
            parent_title: parent.title,
            match_method: matchMethod,
            confidence: confidence,
            is_critical: isCritical,
            dry_run: true
          });
          fixed++;
        }
      } else {
        console.log(`${prefix} ⚠️  Could not find parent for "${topic.title}" (parent_title: "${topic.parent_title || 'N/A'}")`);
        results.skipped.push({
          topic_id: topic.id,
          topic_title: topic.title,
          level: topic.level,
          parent_title: topic.parent_title,
          spec_id: topic.spec_id,
          is_critical: isCritical
        });
        skipped++;
      }
    }

    console.log('');
    console.log(`✅ Fixed: ${fixed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Skipped: ${skipped}`);
    console.log('');

    // STEP 6: Fix invalid parent_id references
    console.log('🔗 Step 6: Fixing invalid parent_id references...');
    let invalidFixed = 0;

    for (const topic of allTopics) {
      if (topic.parent_id) {
        const parent = topicMap.get(topic.parent_id);
        if (!parent) {
          // Parent doesn't exist - clear parent_id
          console.log(`  ⚠️  Topic "${topic.title}" has invalid parent_id (doesn't exist): ${topic.parent_id}`);
          if (!DRY_RUN) {
            const { error } = await supabase
              .from('topics')
              .update({ parent_id: null })
              .eq('id', topic.id);
            
            if (error) {
              console.error(`  ❌ Failed to clear parent_id for "${topic.title}": ${error.message}`);
              continue;
            }
          }
          results.invalidParentIdFixed.push({
            topic_id: topic.id,
            topic_title: topic.title,
            issue: 'Parent does not exist',
            action: 'Cleared parent_id'
          });
          invalidFixed++;
        } else if (parent.level !== topic.level - 1) {
          // Parent level mismatch - clear parent_id (don't try to guess correct parent)
          console.log(`  ⚠️  Topic "${topic.title}" has parent with wrong level (expected ${topic.level - 1}, got ${parent.level})`);
          
          if (!DRY_RUN) {
            const { error } = await supabase
              .from('topics')
              .update({ parent_id: null })
              .eq('id', topic.id);
            
            if (error) {
              console.error(`  ❌ Failed to clear parent_id for "${topic.title}": ${error.message}`);
              continue;
            }
          }
          results.invalidParentIdFixed.push({
            topic_id: topic.id,
            topic_title: topic.title,
            issue: 'Parent level mismatch',
            action: 'Cleared parent_id (will need manual fix)'
          });
          invalidFixed++;
        }
      }
    }

    if (invalidFixed > 0) {
      console.log(`✅ Fixed ${invalidFixed} invalid parent_id references`);
    } else {
      console.log('✅ No invalid parent_id references found');
    }
    console.log('');

    // STEP 7: Fix circular references
    console.log('🔄 Step 7: Fixing circular references...');
    let circularFixed = 0;

    for (const topic of allTopics) {
      if (topic.parent_id) {
        const visited = new Set();
        let current = topic;
        let depth = 0;
        const maxDepth = 10;

        while (current.parent_id && depth < maxDepth) {
          if (visited.has(current.id)) {
            // Circular reference detected - break it by clearing parent_id
            console.log(`  ⚠️  Circular reference detected for "${topic.title}"`);
            if (!DRY_RUN) {
              const { error } = await supabase
                .from('topics')
                .update({ parent_id: null })
                .eq('id', topic.id);
              
              if (error) {
                console.error(`  ❌ Failed to clear parent_id for "${topic.title}": ${error.message}`);
                break;
              }
            }
            results.circularRefsFixed.push({
              topic_id: topic.id,
              topic_title: topic.title,
              action: 'Cleared parent_id to break cycle'
            });
            circularFixed++;
            break;
          }
          visited.add(current.id);
          current = topicMap.get(current.parent_id);
          if (!current) break;
          depth++;
        }
      }
    }

    if (circularFixed > 0) {
      console.log(`✅ Fixed ${circularFixed} circular references`);
    } else {
      console.log('✅ No circular references found');
    }
    console.log('');

    // STEP 8: Generate summary
    console.log('='.repeat(80));
    console.log('📋 SUMMARY');
    console.log('='.repeat(80));
    console.log('');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`✅ Fixed orphaned topics: ${fixed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Skipped (need manual review): ${skipped}`);
    console.log(`🔗 Fixed invalid parent_id: ${invalidFixed}`);
    console.log(`🔄 Fixed circular references: ${circularFixed}`);
    console.log('');

    // Save results (reuse reportDir from Step 1)
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportFile = join(reportDir, `fix-results-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      dry_run: DRY_RUN,
      results
    }, null, 2));
    console.log(`✅ Results saved to: ${reportFile}`);

    if (results.skipped.length > 0) {
      const csvFile = join(reportDir, `skipped-topics-${new Date().toISOString().split('T')[0]}.csv`);
      const csvHeader = 'id,title,level,parent_title,spec_id,is_critical\n';
      const csvRows = results.skipped.map(t => 
        `"${t.topic_id}","${t.topic_title}","${t.level}","${t.parent_title || ''}","${t.spec_id}","${t.is_critical}"`
      ).join('\n');
      fs.writeFileSync(csvFile, csvHeader + csvRows);
      console.log(`✅ Skipped topics CSV saved to: ${csvFile}`);
    }

    if (!DRY_RUN) {
      console.log('');
      console.log('⚠️  IMPORTANT: Run the diagnostic script again to verify fixes!');
    }

    return results;

  } catch (error) {
    console.error('\n❌ Fix failed:', error);
    throw error;
  }
}

// Run fix
fixOrphanedTopics()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

