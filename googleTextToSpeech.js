import textToSpeech from '@google-cloud/text-to-speech';
import { writeFile } from 'fs/promises';

// Instantiate a client
const googleTextToSpeechClient = new textToSpeech.TextToSpeechClient({
  keyFilename: './moneyview-hackthon-2352b21a61a0.json'  // 🔁 Replace with your JSON key file
});

const synthesizeSpeech = async () => {
  const request = {
    input: { text: `Digital Gold क्या है` },
    voice: { languageCode: 'en-IN', ssmlGender: 'FEMALE', name: 'hi-IN-Wavenet-A', },
    audioConfig: { audioEncoding: 'MP3' },
  };

  try {
    const [textToSpeechResponse] = await googleTextToSpeechClient.synthesizeSpeech(request);
    await writeFile('output.mp3', textToSpeechResponse.audioContent, 'binary');
    console.log('✅ Audio saved as output.mp3');
  } catch (err) {
    console.error('❌ Error generating speech:', err);
  }
};

synthesizeSpeech();
