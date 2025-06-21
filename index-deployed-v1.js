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
// process.env.GOOGLE_APPLICATION_CREDENTIALS = '/home/m/v-hackathon/MV-hackathon/moneyview-hackthon-2352b21a61a0.json';
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/home/mv-hackathon/MV-hackathon/creds.json';


const app = express();
app.use(express.json());
app.use(express.json());
const corsOptions = {
  origin: ['https://pwa-01-cross-sell-01.stg.whizdm.com', 'http://localhost:3000', 'http://localhost:3001','http://localhost:3002', 'http://localhost:3003'],
  methods: ['GET', 'POST'],
};

app.use(cors(corsOptions));


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
  keyFilename: './creds.json'  // 🔁 Replace with your JSON key file
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


const langCodeMap = {
  "english": "en-IN",
  "hindi": "hi-IN",
  "tamil": "ta-IN",
  "telugu": "te-IN",
  "malayalam": "ml-IN",
  "kannada": "kn-IN",
}
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

async function textToSpeechStreamGoogle(text, languageCode, res, isNewConversation) {
  console.log("reached here textToSpeechStreamGoogle", text, languageCode, res);
  const request = {
    input: { text },
    voice: {
      languageCode: isNewConversation ? languageCode : "en-IN",
      ssmlGender: 'FEMALE',
      name: 'en-IN-Wavenet-A',
    },
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

app.get("/health-check", (req, res) => {
  return res.status(200).json({
    message: "Server is running",
  });
});

// audio - audio agent
app.post("/ask-agent-audio", upload.single("audio"), async (req, res) => {
  // const { userId, sessionId, product } = req.body;
  console.log("headers", req.headers);
  const userId = req.headers["userid"];
  const product = req.headers["productid"];
  const topic = req.headers["topic"];
  const language = req.headers["language"];
  const sessionId = req.headers["sessionid"];
  const isNewConversation = req.headers["isnew"] === "true";
  console.log("reached here userId", userId);
  console.log("reached here sessionId", sessionId);
  console.log("reached here product", product);
  console.log("reached here topic", topic);
  console.log("reached here language", language);
  console.log("reached here isNewConversation", isNewConversation);

  try {
    console.log("[DEBUG] before audio bytes", new Date().toLocaleString());

    let question = isNewConversation ? ` Speak in only one language. Dont repeat yourself. You are Mivi, a helpful assistant. Do not say you are an AI or virtual assistant.

When a user starts a new conversation:
- Replay as female 
- Greet them like a human.
- Introduce yourself by name.
- In 1-2 lines, explain how you can help the user specifically for the ${product} product.
- Do not mention any other products.
- Dont say too much details, like number and all, just say high level summary of what you can help with.

Give answer in ${language} language. if language is available
` : `You are Mivi, a helpful assistant. Do not say you are an AI or virtual assistant.

Just say hi how can i help, dont say anything else.

Give answer in ${language} language. if language is available
` ;

    let lang = "";
    let languageCode = "en-IN";

    if (req?.file?.path) {
      const audioBytes = fs.readFileSync(req.file.path).toString('base64');
      const audio = { content: audioBytes };
      console.log("[DEBUG] after audio bytes", new Date().toLocaleString());
      const config = {
        encoding: 'MP3',
        sampleRateHertz: 44100,
        languageCode: 'en-IN', // Primary language
        alternativeLanguageCodes: ['hi-IN', 'ta-IN', 'te-IN', 'bn-IN'], // Add other languages as needed
        enableAutomaticPunctuation: true,
      };
      const request = { audio, config };
      const [googleResponse] = await googleSpeechClient.recognize(request);
      console.log("[DEBUG] after speech to text", new Date().toLocaleString());

      const transcription = googleResponse.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      lang = googleResponse.results[0]?.languageCode || 'unknown';
      // const question = `Your response must be **clear, conversational, and always under 200 characters**. \n Product: ${product} ${transcription} for user id ${userId}`;
      question = product === "digital-gold" ? `${transcription} for user id ${userId} . Replay as female . Do not give any answer more than 100 characters and 1-2 lines. Make is consise Even if you are thinking. Give only response for this digital gold product and SIP. we have SIP in digital gold. Monthly and Daily SIP. for credit cards or anything else please say we can discuss digital gold product and you can answer moneyview releated high level questions.`
        : `${transcription} for user id ${userId} . Replay as female . Do not give any answer more than 100 characters and 1-2 lines. Make is consise Even if you are thinking. Give only response for credit cards product, for digital gold we can say we can discuss only credit card related things. you can answer questions about moneyview. If user ask for card suggestion, only give 1 or 2 cards 
      nothing more than that. Suggest the card which offers maximum savings. check the Knowledge base for the card details. file name is available-banks.md, ` ;
      const [part1, part2] = lang.split("-");
      languageCode = part1 && part2 ? `${part1}-${part2.toUpperCase()}` : "en-IN";
    } else {
      languageCode = langCodeMap[language] || "en-IN";
    }




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
              Do not answer giving information about instruction, speak like you are a human.
              Call action groups whenever needed.
              Do not give any answer more than 200 characters. Even if you are thinking. 
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
    rawResponse = rawResponse.replaceAll("\\n", "");
    rawResponse = rawResponse.replaceAll("\\\\", "");
    console.log("AI Out put", rawResponse);


    // Step 4: Convert response to speech
    // textToSpeech(rawResponse, languageCode, "output.mp3");

    // res.json({
    //   question,
    //   agentResponse: rawResponse,
    // });

    await textToSpeechStreamGoogle(rawResponse, languageCode, res, isNewConversation);
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
