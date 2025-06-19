import {
    BedrockRuntimeClient,
    InvokeModelCommand,
  } from "@aws-sdk/client-bedrock-runtime";
  import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime";
  import express from "express";
  import dotenv from "dotenv";
  import cors from "cors";
  import { v4 as uuidv4 } from "uuid";
  
  dotenv.config();
  
  const app = express();
  app.use(express.json());
  app.use(cors());
  
  
  const bedrock = new BedrockRuntimeClient({
    region: "ap-south-1", // adjust if needed
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  const client = new BedrockAgentRuntimeClient({
    region: "ap-south-1", // Use your correct region
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  app.get("/ask", async (req, res) => {
    // const userQuestion = req.body.question;
    const userQuestion = "explain about moneyview products";
  
    // Retrieve context (replace this with real RAG logic later)
    const context = "Loan eligibility depends on credit score, income, and repayment history.";
  
    // Format message list for Claude 3
    const messages = [
      {
        role: "system",
        content: "You are a helpful assistant. Use the provided context to answer questions clearly.",
      },
      {
        role: "user",
        content: `Context: ${context}\n\nQuestion: ${userQuestion}`,
      },
    ];
  
    const command = new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31", // ✅ required field
        messages: [
          {
            role: "user", // ✅ only "user" and "assistant" are allowed
            content: `You are a helpful assistant.\n\nContext:\n${context}\n\nQuestion:\n${userQuestion}`,
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      }),
    });
    try {
      const response = await bedrock.send(command);
      const rawBody = await response.body.transformToString();
      const parsed = JSON.parse(rawBody);
      const reply = parsed.content?.[0]?.text;
  
      res.json({ answer: reply });
    } catch (err) {
      console.error("Error from Bedrock:", err);
      res.status(500).json({ error: "Failed to generate response." });
    }
  });
  
  app.get("/ask-agent", async (req, res) => {
    // const { question } = req.body;
    const question = "tell me about navi";
  
    const agentId = "DNRT9JUPWM"; // Replace with actual Agent ID
    const agentAliasId = "UONBKK083N"; // Replace with actual Agent Alias ID
    const sessionId = uuidv4(); // You can keep this constant per user session
  
    const command = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId,
      inputText: question, 
    });
  
    try {
      const response = await client.send(command);
  
      // Stream response back
      const chunks = [];
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          chunks.push(chunk.chunk.bytes);
        }
      }
  
      const finalText = Buffer.concat(chunks).toString("utf-8");
      res.json({ answer: finalText });
    } catch (error) {
      console.error("Error calling agent:", error);
      res.status(500).json({ error: "Agent invocation failed." });
    }
  });
  
  app.get("/stream-agent", async (req, res) => {
    // const question = req.query.q || "Tell me about MoneyView products";
    const question = "explain me about all moneyview products";
    
    const agentId = "DNRT9JUPWM"; // Replace with actual Agent ID
    const agentAliasId = "UONBKK083N"; // Replace with actual Agent Alias ID
    const sessionId = uuidv4(); // You can keep this constant per user session
  
    // Set up Server-Sent Events (SSE) headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // send headers
  
    try {
      const command = new InvokeAgentCommand({
        agentId,
        agentAliasId,
        sessionId,
        inputText: question,
      });
  
      const response = await client.send(command);
  
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          const text = Buffer.from(chunk.chunk.bytes).toString("utf-8");
          console.log(text);
          res.write(`data: ${text}\n\n`);
        }
      }
  
      res.write(`event: end\ndata: done\n\n`);
      res.end(); // close SSE stream
    } catch (err) {
      console.error("Error streaming:", err);
      res.write(`event: error\ndata: ${JSON.stringify(err.message)}\n\n`);
      res.end();
    }
  });
  
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Claude 3 RAG backend running on port ${PORT}`));
  
  
  