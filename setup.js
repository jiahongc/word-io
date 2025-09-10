#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('📝 Word-IO - Bilingual Voice Recording Setup');
console.log('================================================\n');

// Check if .env.local exists
const envPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env.local file...');
  const envContent = `# OpenAI API Configuration
# Get your API key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key_here
`;
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env.local file created');
} else {
  console.log('✅ .env.local file already exists');
}

console.log('\n🔧 Next steps:');
console.log('1. Get your OpenAI API key from: https://platform.openai.com/api-keys');
console.log('2. Add your API key to the .env.local file');
console.log('3. Run: npm run dev');
console.log('4. Open http://localhost:3000 in your browser');
console.log('\n🚀 Happy recording!');
