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
    
    // Comprehensive Traditional to Simplified Chinese conversion
    const traditionalToSimplified: { [key: string]: string } = {
      // Common speech words
      '說': '说', '話': '话', '這': '这', '個': '个', '們': '们', '來': '来',
      '時': '时', '會': '会', '國': '国', '學': '学', '業': '业', '發': '发',
      '現': '现', '問': '问', '題': '题', '對': '对', '於': '于', '與': '与',
      '為': '为', '從': '从', '後': '后', '還': '还', '過': '过', '進': '进',
      '開': '开', '關': '关', '點': '点', '間': '间', '長': '长', '短': '短',
      '高': '高', '低': '低', '大': '大', '小': '小', '多': '多', '少': '少',
      '好': '好', '壞': '坏', '新': '新', '舊': '旧', '快': '快', '慢': '慢',
      '早': '早', '晚': '晚', '前': '前', '左': '左', '右': '右',
      '上': '上', '下': '下', '內': '内', '外': '外', '中': '中', '東': '东',
      '南': '南', '西': '西', '北': '北',
      
      // Additional common characters
      '聽': '听', '看': '看', '想': '想', '做': '做', '去': '去', '到': '到',
      '在': '在', '有': '有', '沒': '没', '很': '很', '也': '也', '都': '都',
      '就': '就', '要': '要', '能': '能', '可以': '可以', '知道': '知道',
      '覺得': '觉得', '認為': '认为', '應該': '应该', '需要': '需要', '希望': '希望',
      '喜歡': '喜欢', '愛': '爱', '感覺': '感觉',
      '工作': '工作', '學習': '学习', '生活': '生活', '家庭': '家庭', '朋友': '朋友',
      '時間': '时间', '地方': '地方', '問題': '问题', '事情': '事情', '情況': '情况',
      '機會': '机会', '選擇': '选择', '決定': '决定', '計劃': '计划', '目標': '目标',
      '結果': '结果', '原因': '原因', '方法': '方法', '方式': '方式', '過程': '过程',
      '開始': '开始', '結束': '结束', '完成': '完成', '繼續': '继续', '停止': '停止',
      '幫助': '帮助', '支持': '支持', '鼓勵': '鼓励', '建議': '建议', '意見': '意见',
      '經驗': '经验', '知識': '知识', '技能': '技能', '能力': '能力', '水平': '水平',
      '質量': '质量', '標準': '标准', '要求': '要求', '條件': '条件', '環境': '环境',
      '社會': '社会', '經濟': '经济', '政治': '政治', '文化': '文化', '教育': '教育',
      '科技': '科技', '發展': '发展', '進步': '进步', '改變': '改变', '改善': '改善',
      '提高': '提高', '增加': '增加', '減少': '减少', '降低': '降低', '維持': '维持',
      '保持': '保持', '確保': '确保', '保證': '保证', '確認': '确认', '檢查': '检查',
      '測試': '测试', '評估': '评估', '分析': '分析', '研究': '研究', '調查': '调查',
      '報告': '报告', '記錄': '记录', '資料': '资料', '信息': '信息', '數據': '数据',
      '統計': '统计', '發現': '发现', '結論': '结论'
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