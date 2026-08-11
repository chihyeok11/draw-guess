const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

const words = ["바나나", "사과", "비행기", "강아지", "고양이", "피자", "자동차", "호랑이", "안경", "시계", "아이패드", "선풍기", "지구", "선글라스", "기타", "피아노", "축구공", "아이스크림", "햄버거", "우산"];
const rooms = {};

// 6자리 영문+숫자 랜덤 방 코드 생성 함수
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

io.on('connection', (socket) => {
    let currentRoom = null;
    let nickname = "";

    // 1. 방 만들기 (방 코드 자동 생성)
    socket.on('createRoom', ({ userNick }) => {
        let roomCode = generateRoomCode();
        while (rooms[roomCode]) { // 중복 코드 방지
            roomCode = generateRoomCode();
        }

        rooms[roomCode] = {
            players: [],
            drawerIndex: -1,
            currentWord: "",
            timer: null,
            timeLeft: 60,
            isPlaying: false
        };

        socket.emit('roomCreated', roomCode);
        joinRoomLogic(socket, roomCode, userNick);
    });

    // 2. 방 참가하기
    socket.on('joinRoom', ({ roomCode, userNick }) => {
        const upperCode = roomCode.trim().toUpperCase();
        if (!rooms[upperCode]) {
            socket.emit('errorMessage', '존재하지 않는 방 코드입니다.');
            return;
        }
        joinRoomLogic(socket, upperCode, userNick);
    });

    function joinRoomLogic(socket, roomCode, userNick) {
        currentRoom = roomCode;
        nickname = userNick;
        socket.join(roomCode);

        rooms[roomCode].players.push({ id: socket.id, nickname: nickname, score: 0 });

        socket.emit('joinSuccess', { roomCode, nickname });
        io.to(roomCode).emit('updatePlayers', rooms[roomCode].players);
        io.to(roomCode).emit('chatMessage', { system: true, text: `${nickname}님이 입장하셨습니다.` });
    }

    // 게임 시작
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

    // 그림 그리기
    socket.on('draw', (drawData) => {
        if (currentRoom) socket.to(currentRoom).emit('draw', drawData);
    });

    // 캔버스 지우기
    socket.on('clearCanvas', () => {
        if (currentRoom) io.to(currentRoom).emit('clearCanvas');
    });

    // 채팅 & 정답 확인
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
            setTimeout(() => nextTurn(currentRoom), 2000);
        } else {
            io.to(currentRoom).emit('chatMessage', { nickname: nickname, text: msg });
        }
    });

    // 퇴장
    socket.on('disconnect', () => {
        const room = rooms[currentRoom];
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            io.to(currentRoom).emit('updatePlayers', room.players);
            io.to(currentRoom).emit('chatMessage', { system: true, text: `${nickname}님이 퇴장하셨습니다.` });
            if (room.players.length === 0) {
                clearInterval(room.timer);
                delete rooms[currentRoom];
            }
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`서버 실행 중: ${PORT}`));
