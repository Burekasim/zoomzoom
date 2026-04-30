data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.name}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_ddb" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
    ]
    resources = [
      aws_dynamodb_table.main.arn,
      "${aws_dynamodb_table.main.arn}/index/*",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_ddb" {
  role   = aws_iam_role.lambda.id
  name   = "ddb"
  policy = data.aws_iam_policy_document.lambda_ddb.json
}

locals {
  handlers = {
    api       = "api"
    reminders = "reminders"
  }
}

# Each entry under api/dist/<name>.zip is produced by `npm run build` in api/
resource "aws_lambda_function" "fn" {
  for_each = local.handlers

  function_name = "${local.name}-${each.value}"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../api/dist/${each.value}.zip"
  source_code_hash = filebase64sha256("${path.module}/../api/dist/${each.value}.zip")

  environment {
    variables = merge(
      { TABLE_NAME = aws_dynamodb_table.main.name },
      each.value == "api" ? { ORIGIN_SECRET = random_password.cf_to_api_secret.result } : {}
    )
  }
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = local.handlers
  name              = "/aws/lambda/${aws_lambda_function.fn[each.key].function_name}"
  retention_in_days = 30
}
