# Use Node.js
FROM node:18

# Set app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy rest of the code
COPY . .

# Start bot
CMD ["npm", "start"]