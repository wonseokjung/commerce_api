#!/bin/bash

# 빌드 디렉토리로 이동
cd "${DEPLOYMENT_SOURCE}"

# npm 설치 및 빌드
echo "Installing dependencies..."
npm install

echo "Building application..."
npm run build

# dist 폴더로 파일 복사
echo "Copying files to deployment directory..."
cp -r dist "${DEPLOYMENT_TARGET}"
cp package.json "${DEPLOYMENT_TARGET}"
cp web.config "${DEPLOYMENT_TARGET}"

cd "${DEPLOYMENT_TARGET}"

# 프로덕션 의존성만 설치
echo "Installing production dependencies..."
npm install --only=production

echo "Deployment completed successfully!" 