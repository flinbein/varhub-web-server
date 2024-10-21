FROM node:22-alpine3.20
WORKDIR /home/node/app
COPY package*.json ./
COPY dist ./dist
RUN apk add --no-cache python3 py3-pip make g++ git
RUN npm install
EXPOSE 80
ENTRYPOINT [ "npm", "start", "--", "--port", "80", "--host", "0.0.0.0", "--ivmInspect", "true" ]
