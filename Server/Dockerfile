FROM node:20-bookworm-slim

# Create app directory
WORKDIR /usr/src/app

# Install native dependencies for ffmpeg-static and sharp (if any)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Bind to Port 3000 by default (overridable via ENV)
EXPOSE 3000

# Start command
CMD [ "npm", "start" ]
