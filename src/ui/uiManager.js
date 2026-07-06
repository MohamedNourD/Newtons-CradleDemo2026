import { CONFIG, MODES } from '../core/config.js';
import { STATE } from '../core/state.js';

export class UIManager {
    constructor(physics) {
        this.physics = physics;
        this.history = [];
        this.MAX_HIST = 150;
        this.lastDOMUpdate = 0;
        this.lastEduTime = 0;

        this.dom = {
            id: document.getElementById('dp-id'),
            theta: document.getElementById('dp-theta'),
            omega: document.getElementById('dp-omega'),
            vel: document.getElementById('dp-vel'),
            mom: document.getElementById('dp-mom'),
            sKE: document.getElementById('dp-sys-ke'),
            sPE: document.getElementById('dp-sys-pe'),
            sTE: document.getElementById('dp-sys-total'),
            sDev: document.getElementById('dp-sys-dev'),
            devCont: document.getElementById('dev-container'),
            canvas: document.getElementById('energy-canvas'),
            ctx: document.getElementById('energy-canvas').getContext('2d'),
            gbId: document.getElementById('gb-id'),
            eduOverlay: document.getElementById('edu-overlay'),
            hint: document.getElementById('onboarding-hint')
        };

        this.bindEvents();
        this.setDefaultLegend();
    }

    bindEvents() {
        const legendDatabase = {
            realistic: { t: "الوضع الواقعي", c: "عرض واقعي يوضح التفاعل المادي البحت. التراكبات التحليلية معطلة." },
            energy: { t: "الديناميكا الحرارية", c: "<div class='legend-item'><div class='color-box' style='background:var(--ke-color);'></div>عمود الطاقة الحركية</div><div class='legend-item'><div class='color-box' style='background:var(--pe-color);'></div>عمود طاقة الوضع</div>" },
            forces: { t: "الكينماتيكا والشبكة", c: "<div class='legend-item'><div class='color-box' style='background:#00e676;'></div>متجه السرعة</div><div class='legend-item'><div class='color-box' style='background:#b055ff;'></div>الزخم (p=mv)</div><div class='legend-item'><div class='color-box' style='background:#ffaa00;'></div>موجة صوتية متتابعة</div>" },
            debug: { t: "تحليل علمي", c: "قراءة رقمية متقدمة لقيم الدفع (J) وحالات الزخم قبل وبعد التصادم. يعرض نقاط التلامس والمتجهات العمودية." },
            split: { t: "شاشة المختبر المقسومة", c: "عرض مزدوج: عرض واقعي (يمين) متزامن مع التراكب التحليلي (يسار)." }
        };

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', event => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                event.target.classList.add('active');

                const modeStr = event.target.getAttribute('data-mode');
                STATE.mode = MODES[modeStr.toUpperCase()];

                document.getElementById('legend-title').innerText = legendDatabase[modeStr].t;
                document.getElementById('legend-content').innerHTML = legendDatabase[modeStr].c;

                const isSplit = STATE.mode === MODES.SPLIT;
                document.getElementById('split-divider').style.display = isSplit ? 'block' : 'none';
                document.getElementById('label-left').style.display = isSplit ? 'block' : 'none';
                document.getElementById('label-right').style.display = isSplit ? 'block' : 'none';
            });
        });

        const assignToggleListener = (elementId, stateProperty) => {
            document.getElementById(elementId).addEventListener('change', event => {
                STATE[stateProperty] = event.target.checked;
            });
        };

        assignToggleListener('tog-vel', 'optVel');
        assignToggleListener('tog-mom', 'optMom');
        assignToggleListener('tog-force', 'optForce');
        assignToggleListener('tog-bars', 'optBars');
        assignToggleListener('tog-net', 'optNet');

        document.getElementById('sel-physics-mode').addEventListener('change', event => {
            STATE.optConserve = (event.target.value === 'stabilized');
            this.triggerEducationalOverlay(null, STATE.optConserve ? "الوضع المستقر: تصحيح الطاقة الخوارزمي مُفعَّل" : "وضع الفيزياء البحتة: الانحراف الطبيعي والتخميد مُفعَّل");
        });

        document.getElementById('gb-system').onclick = (event) => {
            STATE.graphMode = 'system';
            event.currentTarget.classList.add('active');
            document.getElementById('gb-ball').classList.remove('active');
        };

        document.getElementById('gb-ball').onclick = (event) => {
            STATE.graphMode = 'ball';
            event.currentTarget.classList.add('active');
            document.getElementById('gb-system').classList.remove('active');
        };

        const btnPlay = document.getElementById('btn-play');
        btnPlay.onclick = () => {
            if (window.audioEngine) window.audioEngine.resume(); 
            STATE.paused = !STATE.paused;
            btnPlay.innerText = STATE.paused ? '▶ تشغيل' : '⏸ إيقاف مؤقت';
            btnPlay.classList.toggle('active', STATE.paused);
        };

        document.getElementById('btn-step').onclick = () => {
            if (window.audioEngine) window.audioEngine.resume();
            STATE.paused = true;
            STATE.stepRequested = true;
            btnPlay.innerText = '▶ تشغيل';
            btnPlay.classList.add('active');
        };

        document.getElementById('sel-speed').onchange = event => STATE.timeScale = parseFloat(event.target.value);
    }

    setDefaultLegend() {
        document.getElementById('legend-title').innerText = "الوضع الواقعي";
        document.getElementById('legend-content').innerHTML = "عرض واقعي يوضح التفاعل المادي البحت. التراكبات التحليلية معطلة.";
    }

    triggerEducationalOverlay(event, customText = null) {
        const timestamp = performance.now();
        if (timestamp - this.lastEduTime < 2500 && !customText) return;

        let targetMessage = customText;
        if (!targetMessage && event && event.impulse > 0.5) {
            const academicPhrases = [
                "تصادم مرن: ينتقل الزخم (p = mv) بشكل مثالي.",
                "تنتقل الطاقة بالتتابع عبر موجات صوتية داخل الكرات الثابتة.",
                "قانون الحفظ: الطاقة الميكانيكية الكلية تظل ثابتة بعد التصادم."
            ];
            targetMessage = academicPhrases[Math.floor(Math.random() * academicPhrases.length)];
        }

        if (targetMessage) {
            this.dom.eduOverlay.innerText = targetMessage;
            this.dom.eduOverlay.style.opacity = 1;
            this.lastEduTime = timestamp;
            setTimeout(() => { this.dom.eduOverlay.style.opacity = 0; }, 3500);
        }
    }

    hideHint() {
        if (this.dom.hint.style.display !== 'none') {
            this.dom.hint.style.display = 'none';
        }
    }

    recordHistory() {
        if (STATE.paused && !STATE.stepRequested) return;

        const runtimeSnapshot = {
            t: performance.now(),
            sysTE: STATE.sysTotal,
            sysPE: STATE.sysPE,
            sysKE: STATE.sysKE,
            collision: this.physics.collisionEvents.length > 0,
            balls: this.physics.balls.map(ball => ({ ke: ball.ke, pe: ball.pe }))
        };

        this.history.push(runtimeSnapshot);
        if (this.history.length > this.MAX_HIST) this.history.shift();
    }

    drawGraph() {
        const canvasElement = this.dom.canvas;
        const ctx = this.dom.ctx;
        const width = canvasElement.clientWidth;
        const height = canvasElement.clientHeight;

        if (canvasElement.width !== width) {
            canvasElement.width = width;
            canvasElement.height = height;
        }

        ctx.clearRect(0, 0, width, height);
        if (this.history.length === 0) return;

        const dynamicMaxEnergy = Math.max(STATE.baselineEnergy * 1.2, 5);
        const stepX = width / this.MAX_HIST;

        this.history.forEach((data, i) => {
            if (data.collision) {
                const drawX = i * stepX;
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.moveTo(drawX, 0);
                ctx.lineTo(drawX, height);
                ctx.stroke();
            }
        });

        const traceDataLine = (valueExtractionFn, colorHexStr) => {
            ctx.beginPath();
            ctx.strokeStyle = colorHexStr;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';

            this.history.forEach((data, i) => {
                const targetValue = valueExtractionFn(data);
                const coordinateX = i * stepX;
                const coordinateY = height - (targetValue / dynamicMaxEnergy) * height;

                if (i === 0) ctx.moveTo(coordinateX, coordinateY);
                else ctx.lineTo(coordinateX, coordinateY);
            });
            ctx.stroke();
        };

        if (STATE.graphMode === 'system') {
            traceDataLine(snapshot => snapshot.sysTE, '#00e676');
            traceDataLine(snapshot => snapshot.sysPE, '#3399ff');
            traceDataLine(snapshot => snapshot.sysKE, '#ff3366');
        } else {
            const ballIndexId = STATE.selectedId;
            traceDataLine(snapshot => snapshot.balls[ballIndexId].pe + snapshot.balls[ballIndexId].ke, '#00e676');
            traceDataLine(snapshot => snapshot.balls[ballIndexId].pe, '#3399ff');
            traceDataLine(snapshot => snapshot.balls[ballIndexId].ke, '#ff3366');
        }
    }

    updateDOM(currentTime) {
        this.recordHistory();
        this.drawGraph();

        if (currentTime - this.lastDOMUpdate < 66) return;
        this.lastDOMUpdate = currentTime;

        const targetBall = this.physics.balls[STATE.selectedId];
        const linearVelocity = targetBall.omega * CONFIG.L;
        const linearMomentum = CONFIG.MASS * linearVelocity;

        this.dom.id.innerText = targetBall.id;
        this.dom.gbId.innerText = targetBall.id;
        this.dom.theta.innerText = (targetBall.theta * 180 / Math.PI).toFixed(3) + '°';
        this.dom.omega.innerText = targetBall.omega.toFixed(3) + ' rad/s';
        this.dom.vel.innerText = Math.abs(linearVelocity).toFixed(3) + ' m/s';
        this.dom.mom.innerText = Math.abs(linearMomentum).toFixed(3) + ' kg·m/s';

        this.dom.sKE.innerText = STATE.sysKE.toFixed(3) + ' J';
        this.dom.sPE.innerText = STATE.sysPE.toFixed(3) + ' J';
        this.dom.sTE.innerText = STATE.sysTotal.toFixed(3) + ' J';

        if (!STATE.optConserve) {
            this.dom.devCont.style.display = 'flex';
            const errorMargin = STATE.energyError;

            this.dom.sDev.innerText = (errorMargin > 0 ? '+' : '') + errorMargin.toFixed(4) + ' %';
            this.dom.sDev.className = 'data-value ' + (Math.abs(errorMargin) > 0.05 ? (Math.abs(errorMargin) > 0.5 ? 'error-value' : 'warn-value') : 'exact-match');
        }// داخل الدالة updateDOM(currentTime) بعد إخراج البيانات:
        if(targetBall.mass) {
            this.dom.vel.innerHTML = Math.abs(linearVelocity).toFixed(3) + ' m/s <small style="color:#aaa">(' + targetBall.mass.toFixed(1) + 'kg)</small>';
            this.dom.theta.innerHTML = (targetBall.theta * 180 / Math.PI).toFixed(2) + '° <small style="color:#aaa">(' + (targetBall.length).toFixed(1) + 'm)</small>';
        }
         else {
            this.dom.devCont.style.display = 'none';
        }
    }
}