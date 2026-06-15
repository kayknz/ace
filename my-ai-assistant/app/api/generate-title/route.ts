import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ title: 'New Chat' });
    }

    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      prompt: `Generate a short, maximum 4-word title summarizing this chat prompt. Do not use quotes or punctuation. Prompt: "${prompt}"`,
    });

    return NextResponse.json({ title: text?.trim() || prompt.slice(0, 20) });
  } catch (error) {
    console.error("Title generation error:", error);
    return NextResponse.json({ title: 'New Conversation' });
  }
}