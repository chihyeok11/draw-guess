const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

const words = ["바나나", "사과", "비행기", "강아지", "고양이", "피자", "자동차", "호랑이", "안경", "시계", "아이패드", "선풍기"];
const rooms = {};

io.on('connection', (socket) => {
    let currentRoom = null;
    let nickname = "";

    socket.on('joinRoom', ({ roomCode, userNick }) => {
        currentRoom = roomCode;
        nickname = userNick;
        socket.join(roomCode);

        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                players: [],
                drawerIndex: -1,
                currentWord: "",
                timer: null,
                timeLeft: 60,
                isPlaying: false
            };
        }

        rooms[roomCode].players.push({ id: socket.id, nickname: nickname, score: 0 });
        io.to(roomCode).emit('updatePlayers', rooms[roomCode].players);
        io.to(roomCode).emit('chatMessage', { system: true, text: `${nickname}님이 입장하셨습니다.` });
    });

    socket.on('startGame', () => {
        const room = rooms[currentRoom];
        if (!room || room.players.length < 1) return;
        nextTurn(currentRoom);
    });

    function nextTurn(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        clearInterval(room.timer);
        room.isPlaying = true;
        room.timeLeft = 60;

        room.drawerIndex = (room.drawerIndex + 1) % room.players.length;
        const drawer = room.players[room.drawerIndex];
        room.currentWord = words[Math.floor(Math.random() * words.length)];

        io.to(roomCode).emit('clearCanvas');
        io.to(roomCode).emit('turnStart', {
            drawerId: drawer.id,
            drawerNick: drawer.nickname,
            timeLeft: room.timeLeft
        });

        io.to(drawer.id).emit('yourWord', room.currentWord);

        room.timer = setInterval(() => {
            room.timeLeft--;
            io.to(roomCode).emit('timerUpdate', room.timeLeft);

            if (room.timeLeft <= 0) {
                clearInterval(room.timer);
                io.to(roomCode).emit('chatMessage', { system: true, text: `⏰ 시간 초과! 정답은 [${room.currentWord}]였습니다.` });
                setTimeout(() => nextTurn(roomCode), 3000);
            }
        }, 1000);
    }

    socket.on('draw', (drawData) => {
        if (currentRoom) socket.to(currentRoom).emit('draw', drawData);
    });

    socket.on('clearCanvas', () => {
        if (currentRoom) io.to(currentRoom).emit('clearCanvas');
    });

    socket.on('sendMessage', (msg) => {
        const room = rooms[currentRoom];
        if (!room) return;

        const isDrawer = room.players[room.drawerIndex]?.id === socket.id;

        if (room.isPlaying && !isDrawer && msg.trim() === room.currentWord) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) player.score += 100;

            io.to(currentRoom).emit('updatePlayers', room.players);
            io.to(currentRoom).emit('chatMessage', { system: true, text: `🎉 [${nickname}]님이 정답을 맞추셨습니다! (+100점)` });

            clearInterval(room.timer);
            setTimeout(() => nextTurn(roomCode), 2000);
        } else {
            io.to(currentRoom).emit('chatMessage', { nickname: nickname, text: msg });
        }
    });

    socket.on('disconnect', () => {
        const room = rooms[currentRoom];
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            io.to(currentRoom).emit('updatePlayers', room.players);
            io.to(currentRoom).emit('chatMessage', { system: true, text: `${nickname}님이 퇴장하셨습니다.` });
            if (room.players.length === 0) delete rooms[currentRoom];
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`서버 실행 중: ${PORT}`));
