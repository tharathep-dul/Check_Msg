FROM node:22-alpine

WORKDIR /app
COPY package.json server.js typhoon.js ./

# ไม่มี dependency ภายนอก จึงไม่ต้อง npm install
ENV NODE_ENV=production
ENV PORT=8787

RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
