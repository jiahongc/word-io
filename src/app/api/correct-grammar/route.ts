import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { text, customPrompt } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Use custom prompt if provided, otherwise use default
    const systemPrompt = customPrompt || 'You are a helpful assistant that corrects grammar and improves the flow of text. ONLY work with English and Chinese Simplified text. Your tasks:\n\n1. Fix basic grammar, punctuation, and sentence structure\n2. Convert spoken lists into proper numbered lists or bullet points when you detect list structures\n3. Improve sentence formatting and structure for better readability\n4. Preserve the original meaning and language mix\n5. Do not add unnecessary words or translate between languages\n6. If the text contains any other languages besides English or Chinese Simplified, leave it unchanged.\n7. If the text is correct. Simplify output the original text, nothing else.\n\nFormat lists properly:\n- Use numbered lists (1., 2., 3.) for sequential items\n- Use bullet points (•) for non-sequential items\n- Ensure proper indentation and spacing';

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Please correct the grammar, improve the flow, and format any lists in this text: "${text}"`
        }
      ],
      max_completion_tokens: 1000,
    });

    const correctedText = completion.choices[0]?.message?.content?.trim() || text;

    return NextResponse.json({ correctedText });
  } catch (error) {
    console.error('Error correcting grammar:', error);
    return NextResponse.json(
      { error: 'Failed to correct grammar. Please check your API key.' },
      { status: 500 }
    );
  }
}