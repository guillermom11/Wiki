import OpenAI from 'openai';

export type chatCompletionMessages = OpenAI.Chat.Completions.ChatCompletionMessageParam[]



interface chatResponse {
    response: string
    tokens?: number
}

export async function getOpenAIChatCompletion(messages: chatCompletionMessages, model: string = 'gpt-4o-mini') : Promise<chatResponse> {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const chatCompletion = await openai.chat.completions.create({
        model: model,
        messages: messages,
        temperature: 0.3
    })

    if (chatCompletion.choices[0].message.content) {
        return {
            response: chatCompletion.choices[0].message.content,
            tokens: chatCompletion.usage?.total_tokens
        }
    } else {
        return {
            response: ''
        }
    }
}

export async function createEmbeddings(input: string[], model: string = 'text-embedding-3-small' ): Promise<number[][]> {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });


    const batchSize = 16;
    const allPromises = []

    for (let i = 0; i < input.length; i += batchSize) {
        const batch = input.slice(i, i + batchSize);
        const embeddingPromise = openai.embeddings.create({
            model: model,
            input: batch,
        });
        allPromises.push(embeddingPromise);
    }

    const embeddings = await Promise.all(allPromises)
    return embeddings.map(e => e.data.map(item => item.embedding))[0]
}