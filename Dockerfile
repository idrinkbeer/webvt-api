FROM node:18

WORKDIR /app

# 🔥 THIS is what you're missing
RUN apt-get update && apt-get install -y ffmpeg

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]
