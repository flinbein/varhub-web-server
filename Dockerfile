FROM node:alpine3.19
WORKDIR /home/node/app
COPY package*.json ./
COPY src/dist/* ./dist/
EXPOSE 80
RUN ["npm", "install"]
RUN ["npm", "upgrade"]
RUN ["npm", "run", "build"]
ENTRYPOINT [ "npm", "start", "--", "--port", "80" ]