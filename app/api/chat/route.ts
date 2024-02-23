import { kv } from '@vercel/kv'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import OpenAI from 'openai'
import { sql } from '@vercel/postgres'

import { nanoid } from '@/lib/utils'

export const runtime = 'edge'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: Request) {
  const json = await req.json()
  const { messages } = json
  const userInput = messages[messages.length - 1].content

  const prompt = `Here is my database schema in JSON format:
  {
    "databaseSchema": {
      "tables": [
        {
          "name": "Rooms",
          "columns": {
            "room_id": "Primary Key",
            "name": "VARCHAR(255) NOT NULL"
          }
        },
        {
          "name": "Categories",
          "columns": {
            "category_id": "Primary Key",
            "name": "VARCHAR(255) NOT NULL"
          }
        },
        {
          "name": "Subcategories",
          "columns": {
            "subcategory_id": "Primary Key",
            "category_id": "INTEGER NOT NULL, Foreign Key to Categories",
            "name": "VARCHAR(255) NOT NULL"
          }
        },
        {
          "name": "Brands",
          "columns": {
            "brand_id": "Primary Key",
            "name": "VARCHAR(255) NOT NULL"
          }
        },
        {
          "name": "Products",
          "columns": {
            "product_id": "Primary Key",
            "subcategory_id": "INTEGER NOT NULL, Foreign Key to Subcategories",
            "room_id": "INTEGER NOT NULL, Foreign Key to Rooms",
            "brand_id": "INTEGER NOT NULL, Foreign Key to Brands",
            "name": "VARCHAR(255) NOT NULL",
            "description": "TEXT",
            "price": "NUMERIC(10, 2) NOT NULL",
            "stock_quantity": "INTEGER NOT NULL",
            "image_url": "VARCHAR(255)",
            "height": "NUMERIC(10, 2)",
            "width": "NUMERIC(10, 2)",
            "depth": "NUMERIC(10, 2)",
            "weight": "NUMERIC(10, 2)",
            "color": "VARCHAR(255)"
          }
        }
      ]
    }
  }

  Rooms are: kitchen, living_room, bathroom, bedroom, Bathroom, dining_room
  Categories are: appliances, furniture, fixtures, decor, storage
  Subcategories are: refrigerators, ovens,kitchen_sets, microwaves, dishwashers, stoves, sofas, beds, sinks, showers,bathtubs, wc, lamps, curtains, closets, shelves
  Dimensions are in centimeters
  Room, Category, Subcategory names are in English with all letters lowercase
  Here is the prompt from the user:
  ${userInput}
  If the input from user is that it would be useful for me to query the database (like for example "I want a black fridge" or "I need appliences for my kitchen") for products then given the database schema described above I need you to return an actual SQL query (and only SQL query) that I can ran over my DB to return products best described by the user prompt.
  If the input is just a general question then I need you to return a general answer to the user prompt but try to steer the conversation lightly towards the products in the database.
  The result should be in json format:
  {
    "query": "SELECT * FROM Products WHERE ...",
    "generalAnswer": "..."
  }
  One of the two fields should be empty.
  General answers should be in Slovak language.
  `

  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'gpt-3.5-turbo-1106',
    // response_format: { type: 'json_object' },
    max_tokens: 1000
  })
  if (chatCompletion.choices[0]?.message.content) {
    // const queryString = chatCompletion.choices[0]?.message.content
    console.log(chatCompletion.choices[0]?.message.content)
    const { query, generalAnswer } = JSON.parse(
      chatCompletion.choices[0]?.message.content
    )
    console.log(query)
    console.log(generalAnswer)

    if (query) {
      try {
        const client = await sql.connect()
        const { rows } = await client.query(query)
        client.release()

        console.log(rows)
        if (rows.length === 0) {
          return new Response(
            'V našej ponuke máme veľa produktov, ktoré by Vás mohli zaujímať. Ak by ste mali konkrétny produkt na mysli, môžem Vám s tým pomôcť.'
          )
        }
        let productDetailsToString = 'Tieto produkty by Vás mohli zaujímať:\n\n'
        productDetailsToString =
          productDetailsToString +
          rows
            .map(
              (product: any) =>
                `${product.name}\n Popis: ${product.description}\n Cena: $${product.price}\n Farba: ${product.color}`
            )
            .join('\n\n')
        return new Response(productDetailsToString)
      } catch (e) {
        console.error(e)
        return new Response(
          'V našej ponuke máme veľa produktov, ktoré by Vás mohli zaujímať. Ak by ste mali konkrétny produkt na mysli, môžem Vám s tým pomôcť.'
        )
      }
    }
    return new Response(generalAnswer)
  } else {
    return new Response(
      'V našej ponuke máme veľa produktov, ktoré by Vás mohli zaujímať. Ak by ste mali konkrétny produkt na mysli, môžem Vám s tým pomôcť.'
    )
  }
}
