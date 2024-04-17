FROM node:alpine3.17
WORKDIR /home/node/app
COPY package*.json ./
COPY src/index.ts ./
EXPOSE 80
RUN ["npm", "install"]
RUN ["npm", "run", "build"]
ENTRYPOINT [ "npm", "start", "--", "--port", "80" ]