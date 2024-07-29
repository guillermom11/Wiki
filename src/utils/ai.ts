import OpenAI from 'openai';
import { AzureOpenAI } from "openai";

export type chatCompletionMessages = OpenAI.Chat.Completions.ChatCompletionMessageParam[]



interface chatResponse {
    response: string
    tokens?: number
}

export async function getOpenAIChatCompletion(messages: chatCompletionMessages, model: string = 'gpt-4o-mini') : Promise<chatResponse> {
    const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const chatCompletion = await client.chat.completions.create({
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

export async function getAzureOpenAIChatCompletion(messages: chatCompletionMessages, model: string = 'gpt-4o-mini') : Promise<chatResponse> {
    const client = new AzureOpenAI({
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        // deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
    });

    const chatCompletion = await client.chat.completions.create({
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

export async function createEmbeddingsOpenAI(input: string[], model: string = 'text-embedding-3-small' ): Promise<number[][]> {
    const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });


    const batchSize = 16;
    const allPromises = []

    for (let i = 0; i < input.length; i += batchSize) {
        const batch = input.slice(i, i + batchSize);
        const embeddingPromise = client.embeddings.create({
            model: model,
            input: batch,
        });
        allPromises.push(embeddingPromise);
    }

    const embeddings = await Promise.all(allPromises)
    return embeddings.map(e => e.data.map(item => item.embedding)).flat()
}

export async function createEmbeddingsAzureOpenAI(input: string[], model: string = 'text-embedding-3-small' ): Promise<number[][]> {
    const client = new AzureOpenAI({
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
    });

    const batchSize = 16;
    const allPromises = []

    for (let i = 0; i < input.length; i += batchSize) {
        const batch = input.slice(i, i + batchSize);
        const embeddingPromise = client.embeddings.create({
            model: model,
            input: batch,
        });
        allPromises.push(embeddingPromise);
    }

    const embeddings = await Promise.all(allPromises)
    return embeddings.map(e => e.data.map(item => item.embedding)).flat()
}