import { APIGatewayProxyEvent, APIGatewayProxyResult, Handler } from "aws-lambda";

const url = "https://aws.amazon.com/";

export const handler: Handler<APIGatewayProxyEvent, APIGatewayProxyResult> = async (event, context) => {
  try {
    // fetch is available with Node.js 18
    const res = await fetch(url);

    return {
      statusCode: res.status,
      body: JSON.stringify({
        message: await res.text(),
      }),
    };
  } catch (err) {
    console.log(err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "some error happened",
      }),
    };
  }
};
