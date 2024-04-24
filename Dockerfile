FROM node:alpine3.19
WORKDIR /home/node/app
COPY package*.json ./
COPY dist ./dist
COPY node_modules ./node_modules
EXPOSE 80
ENTRYPOINT [ "npm", "start", "--", "--port", "80" ]
