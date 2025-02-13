
import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import bodyParser from 'body-parser'
import session from 'express-session'

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.use(express.static(path.join(__dirname, 'public')))
app.use(bodyParser.json())
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: true }))

let users = {}
let channels = { general: [] }
let roles = { admin: [], user: [] }

app.post('/login', (req, res) => {
  const { username, role } = req.body
  req.session.username = username
  req.session.role = role
  roles[role].push(username)
  res.json({ success: true })
})

app.get('/logout', (req, res) => {
  req.session.destroy()
  res.json({ success: true })
})

app.get('/channels', (req, res) => {
  res.json(Object.keys(channels))
})

io.on('connection', socket => {
  socket.on('join', ({ username, channel }) => {
    users[socket.id] = { username, channel, role: 'user' }
    if (!channels[channel]) channels[channel] = []
    socket.join(channel)
    io.to(channel).emit('message', { user: 'system', text: `${username} joined ${channel}` })
  })

  socket.on('message', ({ text }) => {
    const user = users[socket.id]
    if (user) io.to(user.channel).emit('message', { user: user.username, text })
  })

  socket.on('create_channel', ({ channel }) => {
    if (!channels[channel]) {
      channels[channel] = []
      io.emit('channel_created', channel)
    }
  })

  socket.on('moderate', ({ targetUser }) => {
    const user = users[socket.id]
    if (user && roles.admin.includes(user.username)) {
      io.to(users[targetUser].channel).emit('message', { user: 'system', text: `${targetUser} has been moderated` })
      delete users[targetUser]
    }
  })

  socket.on('disconnect', () => {
    const user = users[socket.id]
    if (user) {
      io.to(user.channel).emit('message', { user: 'system', text: `${user.username} left` })
      delete users[socket.id]
    }
  })
})

server.listen(3000, () => console.log('Server running on port 3000'))

const frontend = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat App</title>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const socket = io();
            const username = prompt('Enter your username:');
            const channel = 'general';
            socket.emit('join', { username, channel });

            socket.on('message', ({ user, text }) => {
                const messages = document.getElementById('messages');
                const messageElement = document.createElement('div');
                messageElement.textContent = `${user}: ${text}`;
                messages.appendChild(messageElement);
            });

            document.getElementById('send').addEventListener('click', () => {
                const text = document.getElementById('message').value;
                socket.emit('message', { text });
                document.getElementById('message').value = '';
            });
        });
    </script>
</head>
<body>
    <div id="chat">
        <div id="messages" style="height: 300px; overflow-y: scroll;"></div>
        <input id="message" type="text" placeholder="Type a message...">
        <button id="send">Send</button>
    </div>
</body>
</html>
`

app.get('/', (req, res) => {
    res.send(frontend);
})
