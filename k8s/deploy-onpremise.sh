#!/bin/bash
# On-Premise Kubernetes Deployment Script
# Doc-Type: Deployment Script · Version 1.0 · Updated 2025-11-17 · AI Whisperers
#
# Purpose: Deploy YouTube Transcript Extractor to on-premise Kubernetes cluster
# Aligns with port strategy from ~/.claude/mcp/configs/ports.env

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="yt-transcript"
IMAGE_NAME="yt-transcript"
IMAGE_TAG="latest"
NODEPORT=30100  # From API services range (30100-30199)

echo -e "${GREEN}=== YouTube Transcript API - On-Premise Deployment ===${NC}"
echo ""

# Step 1: Verify cluster access
echo -e "${YELLOW}[1/7]${NC} Verifying Kubernetes cluster access..."
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}ERROR: Cannot connect to Kubernetes cluster${NC}"
    echo "Please ensure kubectl is configured and cluster is running"
    exit 1
fi
echo -e "${GREEN}✓ Cluster accessible${NC}"
echo ""

# Step 2: Build Docker image
echo -e "${YELLOW}[2/7]${NC} Building Docker image..."
cd "$(dirname "$0")/.."
if docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .; then
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
else
    echo -e "${RED}ERROR: Docker build failed${NC}"
    exit 1
fi
echo ""

# Step 3: Create namespace
echo -e "${YELLOW}[3/7]${NC} Creating namespace..."
if kubectl get namespace ${NAMESPACE} &> /dev/null; then
    echo -e "${YELLOW}Namespace ${NAMESPACE} already exists${NC}"
else
    kubectl apply -f k8s/namespace.yaml
    echo -e "${GREEN}✓ Namespace created${NC}"
fi
echo ""

# Step 4: Create ConfigMap and Secret
echo -e "${YELLOW}[4/7]${NC} Creating ConfigMap and Secret..."
kubectl apply -f k8s/configmap.yaml

# Check if secret exists, create default if not
if ! kubectl get secret yt-transcript-secret -n ${NAMESPACE} &> /dev/null; then
    echo -e "${YELLOW}Creating default secret (update CORS_ORIGIN for production)${NC}"
    kubectl create secret generic yt-transcript-secret \
        --from-literal=CORS_ORIGIN="*" \
        --namespace=${NAMESPACE}
else
    echo -e "${YELLOW}Secret already exists${NC}"
fi
echo -e "${GREEN}✓ ConfigMap and Secret ready${NC}"
echo ""

# Step 5: Deploy application
echo -e "${YELLOW}[5/7]${NC} Deploying application..."
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
echo -e "${GREEN}✓ Application deployed${NC}"
echo ""

# Step 6: Wait for rollout
echo -e "${YELLOW}[6/7]${NC} Waiting for deployment to complete..."
kubectl rollout status deployment/yt-transcript-api -n ${NAMESPACE} --timeout=300s
echo -e "${GREEN}✓ Deployment successful${NC}"
echo ""

# Step 7: Display access information
echo -e "${YELLOW}[7/7]${NC} Deployment complete!"
echo ""
echo -e "${GREEN}=== ACCESS INFORMATION ===${NC}"
echo ""
echo "Namespace: ${NAMESPACE}"
echo "Replicas: $(kubectl get deployment yt-transcript-api -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}')/3"
echo ""
echo -e "${GREEN}Persistent URL (On-Premise):${NC}"
echo "  http://localhost:${NODEPORT}/api"
echo "  http://localhost:${NODEPORT}/api-docs"
echo ""
echo -e "${GREEN}Example API Call:${NC}"
echo "  curl -X POST http://localhost:${NODEPORT}/api/transcribe \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"url\": \"https://www.youtube.com/watch?v=dQw4w9WgXcQ\", \"format\": \"json\"}'"
echo ""
echo -e "${GREEN}Health Check:${NC}"
echo "  curl http://localhost:${NODEPORT}/api/health"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  View pods:    kubectl get pods -n ${NAMESPACE}"
echo "  View logs:    kubectl logs -n ${NAMESPACE} -l app=yt-transcript-api --tail=100 -f"
echo "  View service: kubectl get svc -n ${NAMESPACE}"
echo "  Delete all:   kubectl delete namespace ${NAMESPACE}"
echo ""
echo -e "${GREEN}Optional: Enable Autoscaling${NC}"
echo "  kubectl apply -f k8s/hpa.yaml"
echo "  (Requires Metrics Server installed)"
echo ""
