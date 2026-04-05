# Docker Deployment

## Quick Start

```bash
# Build the image
docker build -t indelible .

# Or use docker-compose
docker-compose up --build
```

## Using Docker Compose

1. Copy environment variables:
```bash
cp .env.docker.example .env.docker
# Edit .env.docker with your ZERO_G_PRIVATE_KEY
```

2. Start the container:
```bash
docker-compose up --build
```

3. Access the app at http://localhost:3000

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZERO_G_PRIVATE_KEY` | Your 0G wallet private key | **Required** |
| `ZERO_G_RPC_URL` | 0G testnet RPC | https://evmrpc-testnet.0g.ai |
| `ZEROG_RPC_URL` | 0G testnet RPC | https://evmrpc-testnet.0g.ai |
| `ZEROG_INDEXER_URL` | 0G indexer URL | https://indexer-storage-testnet-turbo.0g.ai |
| `FLOW_CONTRACT_ADDRESS` | 0G Storage contract | 0x22E03a6A89B950F1c82ec5e74F8eCa321a105296 |
| `DOCUMENT_REGISTRY_ADDRESS` | Document registry contract | - |
| `ZERO_G_PROVIDER_ADDRESS` | 0G Compute provider | Auto-discovered |

## Local Embeddings Data

Mount your embeddings directory:

```bash
# With Docker
docker run -v ./data/embeddings:/app/data/embeddings:ro indelible

# With docker-compose (already configured)
# Just ensure data/embeddings/*.json exists
```

## Production Deployment

For production, use a proper reverse proxy (nginx, traefik) with HTTPS.

```nginx
# Example nginx config
server {
    listen 443 ssl;
    server_name indelible.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
