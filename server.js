const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

// 제시어 100개 이상
const words = [
    // 동물
    "강아지", "고양이", "호랑이", "사자", "토끼", "다람쥐", "펭귄", "돌고래", "상어", "문어", "오징어", "기린", "코끼리", "팬더", "늑대", "여우", "원숭이", "공룡", "카멜레온", "독수리",
    // 음식
    "피자", "햄버거", "아이스크림", "바나나", "사과", "딸기", "수박", "초밥", "떡볶이", "라면", "치킨", "계란후라이", "붕어빵", "도넛", "케이크", "삼겹살", "핫도그", "만두", "짜장면", "파스타",
    // 사물
    "비행기", "자동차", "안경", "시계", "아이패드", "선풍기", "기타", "피아노", "축구공", "우산", "스마트폰", "노트북", "냉장고", "세탁기", "자전거", "마우스", "키보드", "헤드폰", "거울", "선글라스", "카메라", "연필", "지우개", "가위", "텀블러",
    // 자연 & 우주
    "지구", "태양", "달", "무지개", "번개", "화산", "화성", "자작나무", "단풍잎", "해바라기", "선인장", "구름", "눈사람", "파도", "동굴",
    // 장소 & 직업
    "경찰서", "소방서", "병원", "학교", "공항", "영화관", "놀이공원", "피라미드", "자유의여신상", "에펠탑", "경찰관", "소방관", "의사", "요리사", "우주비행사", "가수",
    // 생활 & 캐릭터/상상
    "신발", "모자", "양말", "장갑", "왕관", "보물상자", "유령", "외계인", "마법사", "로봇", "하트", "해적선", "기구"
];

const rooms = {};

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

    socket.on('createRoom', ({ userNick }) => {
        let roomCode = generateRoomCode();
        while (rooms[roomCode]) {
            roomCode = generateRoomCode();
        }

        rooms[roomCode] = {
            hostId: socket.id, // 방장 ID 저장
            players: [],
            drawerIndex: -1,
            currentWord: "",
            timer: null,
            timeLeft: 60,
            isPlaying: false,
            // 추후 방 설정을 위한 기본 옵션 구조
            settings: {
                maxTime: 60,
                maxRounds: 3
            }
        };

        socket.emit('roomCreated', roomCode);
        joinRoomLogic(socket, roomCode, userNick, true);
    });

    socket.on('joinRoom', ({ roomCode, userNick }) => {
        const upperCode = roomCode.trim().toUpperCase();
        if (!rooms[upperCode]) {
            socket.emit('errorMessage', '존재하지 않는 방 코드입니다.');
            return;
        }
        joinRoomLogic(socket, upperCode, userNick, false);
    });

    function joinRoomLogic(socket, roomCode, userNick, isHost) {
        currentRoom = roomCode;
        nickname = userNick;
        socket.join(roomCode);

        const room = rooms[roomCode];
        const isUserHost = isHost || room.hostId === socket.id;

        room.players.push({
            id: socket.id,
            nickname: nickname,
            score: 0,
            isHost: isUserHost
        });

        socket.emit('joinSuccess', { 
            roomCode, 
            nickname, 
            isPlaying: room.isPlaying,
            isHost: isUserHost 
        });

        io.to(roomCode).emit('updatePlayers', { players: room.players, hostId: room.hostId });
        io.to(roomCode).emit('chatMessage', { system: true, text: `${nickname}님이 입장하셨습니다.` });
    }

    socket.on('startGame', () => {
        const room = rooms[currentRoom];
        if (!room) return;
        
        // 방장만 게임 시작 가능 검증
        if (room.hostId !== socket.id) {
            socket.emit('errorMessage', '방장만 게임을 시작할 수 있습니다.');
            return;
        }

        if (room.isPlaying) return;

        io.to(currentRoom).emit('gameStarted');
        nextTurn(currentRoom);
    });

    function nextTurn(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;

        clearInterval(room.timer);
        room.isPlaying = true;
        room.timeLeft = room.settings.maxTime || 60;

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

            io.to(currentRoom).emit('updatePlayers', { players: room.players, hostId: room.hostId });
            io.to(currentRoom).emit('chatMessage', { system: true, text: `🎉 [${nickname}]님이 정답을 맞추셨습니다! (+100점)` });

            clearInterval(room.timer);
            setTimeout(() => nextTurn(currentRoom), 2000);
        } else {
            io.to(currentRoom).emit('chatMessage', { nickname: nickname, text: msg });
        }
    });

    socket.on('disconnect', () => {
        const room = rooms[currentRoom];
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);

            // 방장이 나간 경우 다음 사람에게 방장 위임
            if (socket.id === room.hostId && room.players.length > 0) {
                room.hostId = room.players[0].id;
                room.players[0].isHost = true;
                io.to(room.hostId).emit('youAreHost');
                io.to(currentRoom).emit('chatMessage', { system: true, text: `👑 ${room.players[0].nickname}님이 새로운 방장이 되었습니다.` });
            }

            io.to(currentRoom).emit('updatePlayers', { players: room.players, hostId: room.hostId });
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
