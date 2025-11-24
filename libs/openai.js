import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateInsight(prompt, context) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful A-Level revision assistant.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 200,
    temperature: 0.7
  })
  
  return response.choices[0].message.content
}

