
// covert text to audio and stream it to client.
export async function textToSpeechStream(text, languageCode = "en-IN") {
    const langVoiceMap = {
      hi: "Aditi",  // Hindi
      ta: "Kajal",  // Tamil
      te: "Teja",   // Telugu
      en: "Joanna", // English
    };
  
    const lang = languageCode.split("-")[0];
    const voiceId = langVoiceMap[lang] || "Joanna";
  
    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: "mp3",
      VoiceId: voiceId,
      LanguageCode: languageCode,
    });
  
    try {
      const response = await polly.send(command);
      const audioStream = response.AudioStream; // Return the audio stream
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Disposition": "inline; filename=response.mp3",
      });
  
      audioStream.pipe(res); 
    } catch (error) {
      console.error("❌ Error generating speech:", error);
      throw error;
    }
  }