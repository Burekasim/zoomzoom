# zoomzoom

Internal serverless CRM-lite: companies → contacts tree, tasks with priority/due dates assignable to multiple contacts, per-entity notes, in-app reminders for stale contacts (>14d) and companies (>30d).

## Stack

- **Auth:** Cognito User Pool federated with AWS IAM Identity Center (SAML)
- **API:** API Gateway HTTP API + Lambda (Node.js 20, TypeScript, bundled with esbuild)
- **Data:** DynamoDB single-table
- **Reminders:** EventBridge cron → Lambda → in-app records
- **Frontend:** React + Vite + Amplify Auth, served from S3 + CloudFront
- **IaC:** Terraform

AWS account: `doit-playground` (`669962866722`), region `us-east-1`.

## Layout

```
infra/   Terraform root module
api/     Lambda source
web/     React frontend
scripts/ Deploy helpers
```

## First-time deploy

```bash
# 1. Build Lambda bundles
cd api && npm install && npm run build

# 2. Build frontend
cd ../web && npm install && npm run build

# 3. Apply Terraform (you must provide the SAML metadata URL of your IAM Identity Center app)
cd ../infra
terraform init
terraform apply -var="saml_metadata_url=https://portal.sso.us-east-1.amazonaws.com/saml/metadata/<id>"

# 4. Sync the built frontend to the S3 bucket output by Terraform
aws s3 sync ../web/dist s3://$(terraform output -raw web_bucket)/ --delete --profile doit-playground
aws cloudfront create-invalidation --distribution-id $(terraform output -raw cloudfront_id) --paths '/*' --profile doit-playground
```

`scripts/deploy.sh` wraps all of the above.

## Data model (single-table DynamoDB)

| Entity   | PK                  | SK                       | GSI1PK              | GSI1SK              |
|----------|---------------------|--------------------------|---------------------|---------------------|
| Company  | `COMPANY#<id>`      | `META`                   | `ALL#COMPANY`       | `<name>`            |
| Contact  | `COMPANY#<cid>`     | `CONTACT#<id>`           | `CONTACT#<id>`      | `META`              |
| Note     | `<parentPK>`        | `NOTE#<isoTs>#<id>`      | —                   | —                   |
| Task     | `TASK#<id>`         | `META`                   | `STATUS#<status>`   | `<dueDateIso>`      |
| TaskLink | `CONTACT#<id>`      | `TASK#<id>`              | `TASK#<id>`         | `CONTACT#<cid>`     |
| Reminder | `REMINDER#<userId>` | `<isoTs>#<id>`           | —                   | —                   |

GSI1 supports: list all companies, look up a contact by id, list tasks by status sorted by due date, list contacts assigned to a task.

## Routes

```
GET    /companies                      list
POST   /companies                      create
GET    /companies/{id}                 get
PATCH  /companies/{id}                 update
DELETE /companies/{id}                 delete
GET    /companies/{id}/contacts        list contacts
POST   /companies/{id}/contacts        create contact
GET    /contacts/{id}                  get
PATCH  /contacts/{id}                  update
DELETE /contacts/{id}                  delete
POST   /contacts/{id}/contacted        mark talked-to (sets lastContactedAt = now)
GET    /tasks                          list
POST   /tasks                          create (body: {title, priority, dueDate, contactIds[]})
PATCH  /tasks/{id}                     update
DELETE /tasks/{id}                     delete
POST   /companies/{id}/notes           add company note
POST   /contacts/{id}/notes            add contact note
GET    /notes                          ?parent=COMPANY#... | CONTACT#...
GET    /summary                        {companies, contacts, tasks, openTasks}
GET    /reminders                      current overdue contacts/companies
```

All routes require a Cognito-issued JWT.

## Reminders

Daily EventBridge schedule (`cron(0 7 * * ? *)`) fires `reminders-cron` Lambda which:

- Scans contacts; flags any whose `lastContactedAt` is missing or older than 14 days.
- Aggregates by company; flags any company whose newest contact interaction is older than 30 days.
- Writes one row per active reminder to the `Reminder` partition for the requesting user (singleton user `system` for v1).

The `/reminders` endpoint returns the current rows. UI displays them in a panel; clicking "I talked with him" on a contact updates `lastContactedAt`, which causes that contact's reminder to drop on the next cron run.
