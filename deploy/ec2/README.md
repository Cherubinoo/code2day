# EC2 Deployment

This repo can run as a single EC2-hosted app with:

- `nginx` serving the built React app from `frontend/dist`
- `gunicorn` serving Django on `127.0.0.1:8000`
- `nginx` proxying `/api/` to Django
- Django static files collected into `backend/staticfiles`

## Target layout

Use this directory structure on the EC2 instance:

```text
/srv/code2day/
  backend/
  frontend/
```

## One-time server setup

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx nodejs npm
sudo mkdir -p /srv/code2day
sudo chown -R ubuntu:www-data /srv/code2day
```

Copy the repo into `/srv/code2day`, then create `backend/.env` with production values:

```env
DJANGO_SECRET_KEY=replace-me
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=your-domain.com,your-ec2-public-ip
CODE2DAY_DB_NAME=ramcoad
CODE2DAY_DB_USER=your-db-user
CODE2DAY_DB_PASSWORD=your-db-password
CODE2DAY_DB_HOST=127.0.0.1
CODE2DAY_DB_PORT=3306
JUDGE0_BASE_URL=http://43.205.198.74:2358
JUDGE0_TIMEOUT_SECONDS=30
CORS_ALLOWED_ORIGINS=https://your-domain.com
CSRF_TRUSTED_ORIGINS=https://your-domain.com
```

## Install systemd and nginx configs

```bash
sudo cp deploy/ec2/systemd/code2day-backend.service /etc/systemd/system/code2day-backend.service
sudo cp deploy/ec2/nginx/code2day.conf /etc/nginx/sites-available/code2day.conf
sudo ln -sf /etc/nginx/sites-available/code2day.conf /etc/nginx/sites-enabled/code2day.conf
sudo rm -f /etc/nginx/sites-enabled/default
```

## Deploy or redeploy

```bash
chmod +x deploy/ec2/deploy.sh
./deploy/ec2/deploy.sh
sudo systemctl enable code2day-backend
sudo systemctl start code2day-backend
```

## Smoke checks

```bash
curl http://127.0.0.1:8000/api/health/
curl http://127.0.0.1/api/health/
sudo systemctl status code2day-backend --no-pager
sudo systemctl status nginx --no-pager
```

## Notes

- This setup assumes the React app and Django API share the same host, so the frontend can keep using relative `/api/...` calls.
- `deploy.sh` runs `sync_problem_testcases` so imported problems get sample judge cases from stored examples when needed.
- Add TLS with Certbot or your load balancer before exposing student logins publicly.
