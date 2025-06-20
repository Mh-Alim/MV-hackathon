
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

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


dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const app = express();
app.use(express.json());
app.use(cors());

const upload = multer({ dest: "uploads/" });

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};
const region = process.env.AWS_REGION;
const bucket = process.env.S3_BUCKET_NAME;


const s3 = new S3Client({ region, credentials });
const transcribe = new TranscribeClient({ region, credentials });
const translate = new TranslateClient({ region, credentials });

const delay = ms => new Promise(r => setTimeout(r, ms));


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



/**
 * Convert text to audio and save as an MP3 file.
 * @param {string} text - The text to speak
 * @param {string} languageCode - e.g., "hi-IN", "en-US", "ta-IN"
 * @param {string} filePath - Output file name (e.g., "output.mp3")
 */

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
// async function textToSpeech(text, languageCode = "hi-IN", filePath = "output.mp3") {
//   const langVoiceMap = {
//     "hi": "Aditi",  // Hindi
//     "ta": "Kajal",  // Tamil
//     "te": "Teja",   // Telugu
//     "en": "Joanna", // English
//   };

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
//     const audioStream = response.AudioStream;

//     const writeStream = fs.createWriteStream(filePath);
//     audioStream.pipe(writeStream);

//     writeStream.on("finish", () => {
//       console.log(`✅ Audio saved to: ${filePath}`);
//     });
//   } catch (error) {
//     console.error("❌ Error generating speech:", error);
//   }
// }

// Example usage
// textToSpeech("अलीम जी, आप किस बारे में जानकारी चाहते हैं? हम आपकी किस प्रकार की वित्तीय जरूरतों में मदद कर सकते हैं?", "hi-IN", "namaste.mp3");


async function transcribeAudio(s3Key) {
  console.log("transcribeAudio function called");
  const jobName = `job-${uuidv4()}`;
  const mediaUri = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;

  console.log("reached here mediaUri", {
    mediaUri,
    jobName
  });
  await transcribe.send(new StartTranscriptionJobCommand({
    TranscriptionJobName: jobName,
    MediaFormat: "webm",
    Media: { MediaFileUri: mediaUri },
    IdentifyLanguage: true,
    // OutputBucketName: bucket,
  }));

  let jobStatus = "IN_PROGRESS";
  while (jobStatus === "IN_PROGRESS") {
    await delay(3000);
    const res = await transcribe.send(new GetTranscriptionJobCommand({
      TranscriptionJobName: jobName,
    }));
    console.log("reached here jobStatus res", res);
    jobStatus = res.TranscriptionJob.TranscriptionJobStatus;

    console.log("reached here jobStatus", jobStatus);
    if (jobStatus === "COMPLETED") {
      const transcriptUrl = res.TranscriptionJob.Transcript.TranscriptFileUri;
      console.log("reached here transcriptUrl", transcriptUrl);
      const transcriptRes = await fetch(transcriptUrl);
      console.log("reached here transcriptRes", transcriptRes);
      const json = await transcriptRes.json();
      console.log("reached here json", json);
      console.log("reached here json string ", JSON.stringify(json));

      return [json.results.transcripts[0].transcript, json.results.language_code];
    }


    if (jobStatus === "FAILED") {
      throw new Error("Transcription failed");
    }
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

  const audioFile = req.file;
  console.log("reached here audio file", audioFile);
  const audioStream = fs.createReadStream(audioFile.path);
  console.log("reached here audioStream", audioStream);
  const s3Key = `audio/${uuidv4()}.webm`;
  console.log("reached here s3Key", s3Key);
  console.log("reached here")
  try {
    // Step 1: Upload to S3
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: audioStream,
      ContentType: "audio/webm",
    }));

    // Step 2: Transcribe
    const [question, languageCode] = await transcribeAudio(s3Key); 

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



