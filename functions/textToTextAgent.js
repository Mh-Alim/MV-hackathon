
app.get("/ask-agent", async (req, res) => {
    const { question } = req.body;
    // const question = "tell me about navi";
  
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