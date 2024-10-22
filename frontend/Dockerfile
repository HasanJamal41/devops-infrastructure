# Use a Node.js Alpine image for lightweight setup
FROM node:16-alpine

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json .
RUN npm install

# Copy the rest of the frontend code
COPY . .

# Expose port 3000 (React default)
EXPOSE 3000

# Start the React app
CMD ["npm", "start"]


