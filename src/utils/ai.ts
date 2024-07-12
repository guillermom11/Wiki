import OpenAI from 'openai';

export type chatCompletionMessages = OpenAI.Chat.Completions.ChatCompletionMessageParam[]



interface chatResponse {
    response: string
    tokens?: number
}

export async function getOpenAIChatCompletion(messages: chatCompletionMessages, model: string = 'gpt-3.5-turbo') : Promise<chatResponse> {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const chatCompletion = await openai.chat.completions.create({
        model: model,
        messages: messages,
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