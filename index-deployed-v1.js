
import {
    BedrockRuntimeClient,
    InvokeModelCommand,
  } from "@aws-sdk/client-bedrock-runtime";
  import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
  import express from "express";
  import dotenv from "dotenv";
  import cors from "cors";
  import { v4 as uuidv4 } from "uuid";
  import sdk from "microsoft-cognitiveservices-speech-sdk";
  import path from "path";
  // consistent state - 1
  // transcribe code 
  
  import multer from "multer";
  import fs from "fs";
  import {
    S3Client,
    PutObjectCommand,
  } from "@aws-sdk/client-s3";
  import {
    TranscribeClient,
    StartTranscriptionJobCommand,
    GetTranscriptionJobCommand,
  } from "@aws-sdk/client-transcribe";
  import {
    TranslateClient,
    TranslateTextCommand,
  } from "@aws-sdk/client-translate";
  
  import {
    PollyClient,
    SynthesizeSpeechCommand,
  } from "@aws-sdk/client-polly";

  import { SpeechClient } from '@google-cloud/speech';
  
  
  dotenv.config();
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.env.GOOGLE_APPLICATION_CREDENTIALS = '/Users/alim.khan/Downloads/moneyview-hackthon-2352b21a61a0.json';
  
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
  export async function textToSpeechStream(text, languageCode = "en-IN", res) {
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
    const audioBytes = fs.readFileSync(req.file.path).toString('base64');
    const audio = { content: audioBytes };
    const config = {
      encoding: 'MP3',
      sampleRateHertz: 44100,
      languageCode: 'en-US', // Primary language
      alternativeLanguageCodes: ['hi-IN', 'ta-IN', 'te-IN', 'bn-IN'], // Add other languages as needed
      enableAutomaticPunctuation: true,
    };

    const request = { audio, config };

    const [googleResponse] = await googleSpeechClient.recognize(request);

    const transcription = googleResponse.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    
      
      const question = transcription;
      const languageCode = googleResponse.results[0]?.languageCode || 'unknown';
  
      console.log("reached here question", question);
      console.log("reached here language code", languageCode);
  
      // Step 3: Ask Agent with userId as sessionAttribute
      const agentId = process.env.AGENT_ID;
      const agentAliasId = process.env.AGENT_ALIAS_ID;
  
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
        You are a helpful, friendly, and professional assistant representing **MoneyView**.
        
        ✅ Focus only on the "${product}" product. You may also answer general questions about MoneyView (e.g., vision, trust, awards).
        
        ❌ If asked about other products (like Digi Gold or HLAP when "${product}" is Credit Card), politely say:
        "I'm here to help you with ${product}. Please visit the respective section for Digi Gold or HLAP."
        
        🛡 If someone criticizes MoneyView, respond positively:
        "MoneyView is trusted by millions and committed to excellent service."
        
        ⚖ When compared to other companies, gently favor MoneyView:
        "While many platforms exist, MoneyView stands out for its reliability, customer-first approach, and flexible offerings."
        
        ❗ Avoid generic AI responses. Only answer using the knowledge base. If info isn't found, say:
        "I'm sorry, I don’t have that information right now."
        
        📝 Your response must be **clear, conversational, and always under 200 characters**.
            `.trim()
          }
        }
        
      });
  
      const response = await client.send(command);
      const chunks = [];
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) chunks.push(chunk.chunk.bytes);
      }
      const rawResponse = Buffer.concat(chunks).toString("utf-8");
  
      // Step 4: Convert response to speech
      // textToSpeech(rawResponse, languageCode, "output.mp3");
  
      // res.json({
      //   question,
      //   agentResponse: rawResponse,
      // });
  
      await textToSpeechStream(rawResponse, languageCode, res);
  
      // return res.json({
      //   question,
      //   agentResponse: rawResponse,
      // });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Something went wrong." });
    } finally {
      fs.unlinkSync(audioFile.path);
    }
  });
  
  

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Claude 3 RAG backend running on port ${PORT}`));
  
  
  
  