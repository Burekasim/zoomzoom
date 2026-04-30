output "api_url" {
  value       = aws_apigatewayv2_api.http.api_endpoint
  description = "Base URL for the HTTP API."
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "web_bucket" {
  value = aws_s3_bucket.web.id
}

output "cloudfront_id" {
  value = aws_cloudfront_distribution.web.id
}

output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.web.domain_name}"
}
