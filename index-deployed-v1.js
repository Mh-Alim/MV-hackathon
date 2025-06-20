
  import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
  import express from "express";
  import dotenv from "dotenv";
  import cors from "cors";
  import textToSpeech from '@google-cloud/text-to-speech';
  // consistent state - 1
  // transcribe code 
  
  import multer from "multer";
  import fs from "fs";
  import {
    S3Client,
  } from "@aws-sdk/client-s3";
  
  import {
    PollyClient,
    SynthesizeSpeechCommand,
  } from "@aws-sdk/client-polly";

  import { SpeechClient } from '@google-cloud/speech';
  
  
  dotenv.config();
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.env.GOOGLE_APPLICATION_CREDENTIALS = '/home/mv-hackathon/MV-hackathon/moneyview-hackthon-2352b21a61a0.json';
  
  const app = express();
  app.use(express.json());
  app.use(cors());
  
  
  const googleSpeechClient = new SpeechClient();
  const upload = multer({ dest: 'uploads/' });
  
  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_BUCKET_NAME;
  
  
  const s3 = new S3Client({ region, credentials });
  
  const googleTextToSpeechClient = new textToSpeech.TextToSpeechClient({
    keyFilename: './moneyview-hackthon-2352b21a61a0.json'  // 🔁 Replace with your JSON key file
  });
  const client = new BedrockAgentRuntimeClient({
    region: process.env.AWS_REGION, // Use your correct region
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  
  // polly code 
  const polly = new PollyClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  
  // covert text to audio and stream it to client.
  // export async function textToSpeechStream(text, languageCode = "en-IN", res) {
  //   const langVoiceMap = {
  //     hi: "Aditi",  // Hindi
  //     ta: "Kajal",  // Tamil
  //     te: "Teja",   // Telugu
  //     // en: "Joanna", // English
  //     en: "Aditi"
  //   };
  //   console.log("reached here textToSpeechStream", text, languageCode, res);
  
  //   const lang = languageCode.split("-")[0];
  //   const voiceId = langVoiceMap[lang] || "Joanna";
  
  //   const command = new SynthesizeSpeechCommand({
  //     Text: text,
  //     OutputFormat: "mp3",
  //     VoiceId: voiceId,
  //     LanguageCode: languageCode,
  //   });
  
  //   try {
  //     const response = await polly.send(command);
  //     const audioStream = response.AudioStream; // Return the audio stream
  //     res.set({
  //       "Content-Type": "audio/mpeg",
  //       "Content-Disposition": "inline; filename=response.mp3",
  //     });
  
  //     audioStream.pipe(res); 
  //   } catch (error) {
  //     console.error("❌ Error generating speech:", error);
  //     throw error;
  //   }
  // }

  async function textToSpeechStreamGoogle(text, languageCode, res) {
    console.log("reached here textToSpeechStreamGoogle", text, languageCode, res);
    const request = {
      input: { text },
      voice: { languageCode, ssmlGender: 'FEMALE', name: 'hi-IN-Wavenet-A', },
      audioConfig: { audioEncoding: 'MP3' },
    };
  
    try {
      console.log("[DEBUG] before text to speech", new Date().toLocaleString());
      const [textToSpeechResponse] = await googleTextToSpeechClient.synthesizeSpeech(request);
      console.log("[DEBUG] after text to speech", new Date().toLocaleString());
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'inline; filename=response.mp3',
        'Content-Length': textToSpeechResponse.audioContent.length
      });
      res.send(Buffer.from(textToSpeechResponse.audioContent, 'binary'));
      console.log("[DEBUG] after send", new Date().toLocaleString());
    } catch (err) {
      console.error('❌ Error generating speech:', err);
    }
  }

  // audio - audio agent
  app.post("/ask-agent-audio", upload.single("audio"), async (req, res) => {
    // const { userId, sessionId, product } = req.body;
    console.log("headers", req.headers);
    const userId = req.headers["userid"];
    const product = req.headers["productid"];
    const sessionId = req.headers["sessionid"];
    console.log("reached here userId", userId);
    console.log("reached here sessionId", sessionId);
    console.log("reached here product", product);
    try {
    console.log("[DEBUG] before audio bytes", new Date().toLocaleString());
    const audioBytes = fs.readFileSync(req.file.path).toString('base64');
    const audio = { content: audioBytes };
    console.log("[DEBUG] after audio bytes", new Date().toLocaleString());
    const config = {
      encoding: 'MP3',
      sampleRateHertz: 44100,
      languageCode: 'en-US', // Primary language
      alternativeLanguageCodes: ['hi-IN', 'ta-IN', 'te-IN', 'bn-IN'], // Add other languages as needed
      enableAutomaticPunctuation: true,
    };

    const request = { audio, config };


    const [googleResponse] = await googleSpeechClient.recognize(request);

    console.log("[DEBUG] after speech to text", new Date().toLocaleString());
    const transcription = googleResponse.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    
      
      const question = `Your response must be **clear, conversational, and always under 200 characters**. \n ${transcription}`;
      const lang = googleResponse.results[0]?.languageCode || 'unknown';
      const [part1, part2] = lang.split("-");
      const languageCode = `${part1}-${part2.toUpperCase()}`;
  
      console.log("reached here question", question);
      console.log("reached here language code", lang, languageCode); 
  
      // Step 3: Ask Agent with userId as sessionAttribute
      const agentId = process.env.AGENT_ID;
      const agentAliasId = process.env.AGENT_ALIAS_ID;
      console.log("[DEBUG] before invoke agent", new Date().toLocaleString());
      const command = new InvokeAgentCommand({
        agentId,
        agentAliasId,
        sessionId, // 👈 Use sessionId from frontend
        inputText: question,
        sessionState: {
          sessionAttributes: {
            userId, // 👈 Store userId so Lambda can use it
            product, // 👈 Store product so Lambda can use it
          }
        },
        promptOverrideConfiguration: {
          promptTemplate: {
            promptType: "SYSTEM",
            promptText: `
            You are a polite and reliable support agent for the MoneyView app. Your job is to help users understand how to use the app's screens, features, products, and offers.
        Only use the connected Knowledge Base for answers. Do not guess or use any information outside the Knowledge Base. If an answer is not found, respond with: "Sorry, I do not have that information right now."
              Keep your responses short and to the point. Do not exceed 200 characters. If the answer is long, share only a high-level summary. Maintain a clear, simple, polite, and human-like tone. Avoid robotic or overly promotional language.
              If the user speaks in Hindi, reply in Hinglish (Hindi in Roman script). If the user speaks in Tamil, reply in Tamnglish (Tamil in Roman script). If the user speaks in Malayalam, reply in Manglish (Malayalam in Roman script). If the language is unclear, respond with: "Sorry, I could not understand that. Could you please rephrase in English, Hindi or Tamil?"
              After each answer, ask: "Do you have any other questions?"
              If the user says "no", "nahi", "illa", or gives no response for 60 seconds, end the session with: "Glad I could help. Ending the chat now. Have a great day!" or "It looks like you are away. I will end the chat now. You can reach out again anytime!"
              Never mention that you are an AI or virtual assistant. Do not share opinions, assume user intent, or promote other apps. Only help with MoneyView app-related queries.
              If the user asks something vague like "card issue", reply with: "Can you please tell me exactly what help you need with the card?"
              If the user repeats the same question, respond once more with the same Knowledge Base answer. Then say: "This is the information I have from our system. For more help, please contact our support team."
              If a feature is not available or unsupported, say: "That feature is not available right now. Please try again later or check back soon." or "Sorry, that is not something we support right now."
              If the user asks for the best recommended credit card, follow this logic step-by-step:
              Step 1: Check if the user is on the Credit Card screen. Get eligible banks from UI or context. Filter cards from available-banks.md to include only cards from those banks. Do not show ineligible cards.
              Step 2: Ask the user: "What key benefits are you looking for in your credit card? (e.g., cashback, travel rewards, lounge access, fuel savings, shopping offers)"
              Step 3: From the eligible cards, filter those that match the user's benefit preferences. If no cards match, say: "Based on your preferences, we could not find a matching card. Would you like to try different benefits?"
              Step 4: If only one card matches, say: "Based on your preferences, we recommend the <card name> card. You can go ahead and apply for it now." Then stop.
              Step 5: If multiple cards match, ask: "Can you tell me your average yearly spend in these categories: groceries, bill payments, travel, dining out, and online shopping?"
              Step 6: Calculate annual savings for each card based on spend pattern and benefits from available-banks.md.
              Step 7: Recommend the card with the highest estimated savings. Say: "Based on your spends and benefits, <card name> offers you the highest annual savings. You can apply for it now."
              Do not recommend cards from ineligible banks. Do not make assumptions or use benefits not present in available-banks.md. Ask for clarification if needed. Do not push — just recommend. If the user wants to compare, show the top 3 cards with short benefit summaries.
              
              "
            `.trim()
          }
        }
        
      });
  
      const response = await client.send(command);
      console.log("[DEBUG] after invoke agent", new Date().toLocaleString());
      const chunks = [];
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) chunks.push(chunk.chunk.bytes);
      }
      console.log("[DEBUG] after chunking", new Date().toLocaleString());

      let rawResponse = Buffer.concat(chunks).toString("utf-8");
      console.log("[DEBUG] after rawResponse", new Date().toLocaleString());
      console.log("reached here rawResponse before ", rawResponse);
      rawResponse = rawResponse.replaceAll("\\n", "");
      rawResponse = rawResponse.replaceAll("\\\\", "");
      console.log("reached here rawResponse after", rawResponse);


      // Step 4: Convert response to speech
      // textToSpeech(rawResponse, languageCode, "output.mp3");
  
      // res.json({
      //   question,
      //   agentResponse: rawResponse,
      // });
  
      await textToSpeechStreamGoogle(rawResponse, languageCode, res);
      console.log("Successfully sent the response to the client");
      // return res.json({
      //   question,
      //   agentResponse: rawResponse,
      // });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Something went wrong." });
    } finally {
      console.log("reached here finally");
      // fs.unlinkSync(audioFile.path);
    }
  });
  
  

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Claude 3 RAG backend running on port ${PORT}`));
  
  
  
  