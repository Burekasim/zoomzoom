#!/usr/bin/env bash
# End-to-end deploy: build Lambda bundles, build frontend, terraform apply,
# then sync the frontend to S3 + invalidate CloudFront.
#
# Pass the SAML metadata URL as the first arg, or via $SAML_METADATA_URL.
set -euo pipefail
SAML_METADATA_URL="${1:-${SAML_METADATA_URL:-}}"
PROFILE="${AWS_PROFILE:-doit-playground}"
REGION="${AWS_REGION:-us-east-1}"

cd "$(dirname "$0")/.."

echo "[1/5] Building Lambda bundles…"
( cd api && npm install --silent && npm run build )

echo "[2/5] Terraform apply…"
ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
TF_STATE_BUCKET="zoomzoom-tfstate-$ACCOUNT_ID"
aws s3api head-bucket --bucket "$TF_STATE_BUCKET" --profile "$PROFILE" 2>/dev/null || \
  aws s3api create-bucket --bucket "$TF_STATE_BUCKET" --region "$REGION" --profile "$PROFILE" >/dev/null
aws s3api put-bucket-versioning --bucket "$TF_STATE_BUCKET" \
  --versioning-configuration Status=Enabled --profile "$PROFILE"

( cd infra
  terraform init -upgrade -reconfigure \
    -backend-config="bucket=$TF_STATE_BUCKET" \
    -backend-config="key=zoomzoom.tfstate" \
    -backend-config="region=$REGION"
  terraform apply -auto-approve \
    -var="aws_profile=$PROFILE" \
    -var="aws_region=$REGION" \
    -var="saml_metadata_url=$SAML_METADATA_URL"
)

API_URL=$(cd infra && terraform output -raw api_url)
COGNITO_DOMAIN=$(cd infra && terraform output -raw cognito_domain)
CLIENT_ID=$(cd infra && terraform output -raw user_pool_client_id)
WEB_BUCKET=$(cd infra && terraform output -raw web_bucket)
CF_ID=$(cd infra && terraform output -raw cloudfront_id)
CF_URL=$(cd infra && terraform output -raw cloudfront_url)

echo "[3/5] Building frontend…"
( cd web
  cat > .env.production <<EOF
VITE_API_URL=$API_URL
VITE_COGNITO_DOMAIN=$COGNITO_DOMAIN
VITE_USER_POOL_CLIENT_ID=$CLIENT_ID
EOF
  npm install --silent
  npm run build
)

echo "[4/5] Syncing to S3…"
aws s3 sync web/dist "s3://$WEB_BUCKET/" --delete --profile "$PROFILE"

echo "[5/5] Invalidating CloudFront…"
aws cloudfront create-invalidation \
  --distribution-id "$CF_ID" --paths '/*' \
  --profile "$PROFILE" >/dev/null

echo
echo "Done. App: $CF_URL"
echo "Don't forget to add $CF_URL/callback to the Cognito callback URLs"
echo "(re-run with -var=\"callback_urls=[\\\"$CF_URL/callback\\\"]\" or update the var defaults)."
