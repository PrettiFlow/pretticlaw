FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install pretticlaw globally
RUN npm install -g pretticlaw

# Create pretticlaw home
RUN mkdir -p /root/.pretticlaw

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 18790
EXPOSE 6767

ENTRYPOINT ["/entrypoint.sh"]