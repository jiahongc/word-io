import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const language = formData.get('language') as string;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Convert File to Buffer
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Create a File-like object for OpenAI API
    const audioFileForOpenAI = new File([audioBuffer], audioFile.name, {
      type: audioFile.type,
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFileForOpenAI,
      model: 'whisper-1',
      language: undefined, // Auto-detect (English and Chinese)
      response_format: 'text',
    });

    // Post-process to convert Traditional Chinese to Simplified if needed
    let processedTranscript = transcription;
    
    // Simple Traditional to Simplified Chinese conversion for common characters
    const traditionalToSimplified: { [key: string]: string } = {
      '說': '说',
      '話': '话', 
      '這': '这',
      '個': '个',
      '們': '们',
      '來': '来',
      '時': '时',
      '會': '会',
      '國': '国',
      '學': '学',
      '業': '业',
      '發': '发',
      '現': '现',
      '問': '问',
      '題': '题',
      '對': '对',
      '於': '于',
      '與': '与',
      '為': '为',
      '從': '从',
      '後': '后',
      '還': '还',
      '過': '过',
      '進': '进',
      '開': '开',
      '關': '关',
      '點': '点',
      '間': '间',
      '長': '长',
      '短': '短',
      '高': '高',
      '低': '低',
      '大': '大',
      '小': '小',
      '多': '多',
      '少': '少',
      '好': '好',
      '壞': '坏',
      '新': '新',
      '舊': '旧',
      '快': '快',
      '慢': '慢',
      '早': '早',
      '晚': '晚',
      '前': '前',
      '後': '后',
      '左': '左',
      '右': '右',
      '上': '上',
      '下': '下',
      '內': '内',
      '外': '外',
      '中': '中',
      '東': '东',
      '南': '南',
      '西': '西',
      '北': '北'
    };

    // Replace Traditional characters with Simplified ones
    for (const [traditional, simplified] of Object.entries(traditionalToSimplified)) {
      processedTranscript = processedTranscript.replace(new RegExp(traditional, 'g'), simplified);
    }

    return NextResponse.json({ transcript: processedTranscript });
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return NextResponse.json(
      { error: 'Failed to transcribe audio' },
      { status: 500 }
    );
  }
}

