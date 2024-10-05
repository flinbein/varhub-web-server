FROM node:alpine3.19
WORKDIR /home/node/app
COPY package*.json ./
COPY dist ./dist
RUN apk add --no-cache git
RUN npm install
EXPOSE 80
ENTRYPOINT [ "npm", "start", "--", "--port", "80", "--host", "0.0.0.0", "--ivmInspect", "true" ]
