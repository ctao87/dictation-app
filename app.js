// 单词听写应用 - 使用有道API（修复版）
class DictationApp {
    constructor() {
        this.batches = [];
        this.nextBatchId = 1;
        this.currentDictation = null;
        this.currentAccent = 'US';
        this.isPaused = false;
        this.isRunning = false;

        this.init();
    }

    init() {
        this.loadData();
        this.bindEvents();
        this.updateBatchIndicator();
        this.renderBatchList();
    }

    loadData() {
        const data = localStorage.getItem('dictationData');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                this.batches = parsed.batches || [];
                this.nextBatchId = parsed.nextBatchId || 1;
            } catch (e) {
                console.error('Load data error:', e);
            }
        }
    }

    saveData() {
        localStorage.setItem('dictationData', JSON.stringify({
            batches: this.batches,
            nextBatchId: this.nextBatchId
        }));
    }

    bindEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        document.getElementById('add-words-btn').addEventListener('click', () => this.previewWords());
        document.getElementById('confirm-batch-btn').addEventListener('click', () => this.confirmBatch());
        document.getElementById('cancel-batch-btn').addEventListener('click', () => this.cancelPreview());

        document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
        document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));
        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('clear-btn').addEventListener('click', () => this.clearAll());

        document.getElementById('batch-numbers').addEventListener('input', (e) => this.parseBatchNumbers(e.target.value));

        document.getElementById('speech-rate').addEventListener('input', (e) => {
            document.getElementById('rate-value').textContent = e.target.value + 'x';
        });
        document.getElementById('start-dictation-btn').addEventListener('click', () => this.startDictation());

        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('stop-dictation-btn').addEventListener('click', () => this.stopDictation());
        document.getElementById('restart-btn').addEventListener('click', () => this.restartDictation());
        document.getElementById('speak-all-btn').addEventListener('click', () => this.speakAllResults());

        document.getElementById('close-modal-btn').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-speak-us-btn').addEventListener('click', () => {
            this.currentAccent = 'US';
            this.updateAccentButtons();
            this.playAudio(document.getElementById('modal-word').textContent, 1);
        });
        document.getElementById('modal-speak-uk-btn').addEventListener('click', () => {
            this.currentAccent = 'UK';
            this.updateAccentButtons();
            this.playAudio(document.getElementById('modal-word').textContent, 2);
        });
        document.getElementById('modal-delete-btn').addEventListener('click', () => this.deleteCurrentWord());
        document.getElementById('word-modal').addEventListener('click', (e) => {
            if (e.target.id === 'word-modal') this.closeModal();
        });
    }

    switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.id === tabId + '-tab'));
        if (tabId === 'batches') this.renderBatchList();
        if (tabId === 'dictation') this.renderAvailableBatches();
    }

    updateBatchIndicator() {
        document.getElementById('batch-indicator').textContent = `批次 #${this.nextBatchId}`;
    }

    renderAvailableBatches() {
        const container = document.getElementById('batch-tags');
        if (this.batches.length === 0) {
            container.innerHTML = `<span class="batch-empty">暂无批次，请先录入单词</span>`;
            return;
        }
        container.innerHTML = this.batches.map(batch => `
            <span class="batch-select-tag" onclick="app.selectBatch(${batch.id})">#${batch.id} (${batch.words.length}词)</span>
        `).join('');
    }

    selectBatch(batchId) {
        const input = document.getElementById('batch-numbers');
        const currentValue = input.value.trim();
        if (currentValue) {
            const numbers = currentValue.split(/[,，、\s]+/);
            if (!numbers.includes(String(batchId))) {
                input.value = currentValue + ',' + batchId;
            }
        } else {
            input.value = batchId;
        }
        this.parseBatchNumbers(input.value);
    }

    async previewWords() {
        const input = document.getElementById('word-input').value.trim();
        if (!input) {
            this.showToast('请输入单词');
            return;
        }

        const words = input.split(/[\n,，、\s]+/).filter(w => w.trim());
        if (words.length === 0) {
            this.showToast('请输入有效的单词');
            return;
        }

        this.pendingWords = words.map(w => ({
            word: w.trim().toLowerCase(),
            phonetic: '',
            meaning: '',
            status: 'loading'
        }));

        this.renderPreview();
        document.getElementById('preview-card').style.display = 'block';
        document.getElementById('word-input').disabled = true;
        document.getElementById('add-words-btn').disabled = true;

        for (let i = 0; i < this.pendingWords.length; i++) {
            const info = await this.fetchWordInfo(this.pendingWords[i].word);
            this.pendingWords[i].phonetic = info.phonetic;
            this.pendingWords[i].meaning = info.meaning;
            this.pendingWords[i].status = 'success';
            this.renderPreview();
            if (i < this.pendingWords.length - 1) await this.delay(300);
        }

        document.getElementById('word-input').disabled = false;
        document.getElementById('add-words-btn').disabled = false;
    }

    renderPreview() {
        const list = document.getElementById('preview-list');
        list.innerHTML = this.pendingWords.map(item => `
            <div class="preview-item">
                <span class="preview-word">${item.word}</span>
                <span style="font-size:12px;color:#666;flex:1;margin-left:10px">${item.meaning || '获取中...'}</span>
                <span class="preview-status success">${item.status === 'loading' ? '⏳' : '✓'}</span>
            </div>
        `).join('');
    }

    confirmBatch() {
        if (!this.pendingWords || this.pendingWords.length === 0) {
            this.showToast('没有可添加的单词');
            return;
        }

        this.batches.push({
            id: this.nextBatchId,
            date: new Date().toLocaleString('zh-CN'),
            words: [...this.pendingWords]
        });
        this.nextBatchId++;
        this.saveData();

        this.showToast(`已添加批次 #${this.nextBatchId - 1}，共 ${this.pendingWords.length} 个单词`);
        document.getElementById('word-input').value = '';
        document.getElementById('preview-card').style.display = 'none';
        this.pendingWords = [];
        this.updateBatchIndicator();
        this.renderBatchList();
    }

    cancelPreview() {
        document.getElementById('word-input').disabled = false;
        document.getElementById('add-words-btn').disabled = false;
        document.getElementById('preview-card').style.display = 'none';
        this.pendingWords = [];
    }

    // 获取单词信息
    async fetchWordInfo(word) {
        let phonetic = '';
        let meaning = '';

        // 方案1: 有道词典（通过CORS代理）
        try {
            const response = await fetch('https://corsproxy.io/?' + encodeURIComponent(`https://dict.youdao.com/jsonapi?q=${word}`));
            if (response.ok) {
                const data = await response.json();
                if (data.ec?.word?.[0]) {
                    phonetic = data.ec.word[0].usphone || data.ec.word[0].ukphone || '';
                }
                if (data.ec?.trans) {
                    meaning = data.ec.trans.map(t => t.pos ? `${t.pos} ${t.tran}` : t.tran).filter(m => m).slice(0, 3).join('; ');
                }
            }
        } catch (e) {}

        // 方案2: 有道suggest
        if (!meaning) {
            try {
                const response = await fetch('https://corsproxy.io/?' + encodeURIComponent(`https://dict.youdao.com/suggest?num=1&doctype=json&q=${word}`));
                if (response.ok) {
                    const data = await response.json();
                    if (data.data?.entries?.[0]) {
                        meaning = data.data.entries[0].explain || '';
                    }
                }
            } catch (e) {}
        }

        // 方案3: MyMemory翻译
        if (!meaning) {
            try {
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.responseStatus === 200) {
                        meaning = data.responseData.translatedText;
                    }
                }
            } catch (e) {}
        }

        return { phonetic, meaning: meaning || word };
    }

    renderBatchList() {
        const container = document.getElementById('batch-list');
        const totalWords = this.batches.reduce((sum, b) => sum + b.words.length, 0);

        document.getElementById('batch-count').textContent = `共 ${this.batches.length} 个批次`;
        document.getElementById('total-words-count').textContent = `${totalWords} 个单词`;

        if (this.batches.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>暂无批次数据</p><p>请先录入单词</p></div>`;
            return;
        }

        container.innerHTML = this.batches.slice().reverse().map(batch => `
            <div class="batch-item">
                <div class="batch-header">
                    <span class="batch-title">批次 #${batch.id} (${batch.words.length}个)</span>
                    <span class="batch-date">${batch.date}</span>
                </div>
                <div class="batch-words">
                    ${batch.words.map(w => `<span class="word-tag" onclick="app.showWordDetail('${w.word}', ${batch.id})">${w.word}</span>`).join('')}
                </div>
                <button class="btn btn-sm btn-danger" onclick="app.deleteBatch(${batch.id})">删除批次</button>
            </div>
        `).join('');
    }

    showWordDetail(word, batchId) {
        const batch = this.batches.find(b => b.id === batchId);
        const wordData = batch?.words.find(w => w.word === word);
        if (!wordData) return;

        this.currentWord = { word, batchId };
        document.getElementById('modal-batch-info').textContent = `批次 #${batchId}`;
        document.getElementById('modal-word').textContent = wordData.word;
        document.getElementById('modal-phonetic').textContent = wordData.phonetic ? `/${wordData.phonetic}/` : '';
        document.getElementById('modal-meaning').textContent = wordData.meaning || '';
        this.currentAccent = 'US';
        this.updateAccentButtons();
        document.getElementById('word-modal').style.display = 'flex';
    }

    updateAccentButtons() {
        document.getElementById('modal-speak-us-btn').classList.toggle('active', this.currentAccent === 'US');
        document.getElementById('modal-speak-uk-btn').classList.toggle('active', this.currentAccent === 'UK');
    }

    closeModal() {
        document.getElementById('word-modal').style.display = 'none';
        this.currentWord = null;
    }

    deleteCurrentWord() {
        if (!this.currentWord) return;
        const batch = this.batches.find(b => b.id === this.currentWord.batchId);
        if (!batch) return;

        batch.words = batch.words.filter(w => w.word !== this.currentWord.word);
        if (batch.words.length === 0) {
            this.batches = this.batches.filter(b => b.id !== batch.id);
        }
        this.saveData();
        this.closeModal();
        this.renderBatchList();
        this.showToast('已删除');
    }

    deleteBatch(batchId) {
        if (!confirm(`确定删除批次 #${batchId}？`)) return;
        this.batches = this.batches.filter(b => b.id !== batchId);
        this.saveData();
        this.renderBatchList();
        this.showToast('已删除');
    }

    parseBatchNumbers(value) {
        const container = document.getElementById('selected-batches');
        if (!value.trim()) {
            container.innerHTML = '';
            return;
        }

        const numbers = value.split(/[,，、\s]+/).map(n => parseInt(n.trim()));
        const validNumbers = numbers.filter(n => !isNaN(n) && this.batches.some(b => b.id === n));
        const invalidNumbers = numbers.filter(n => !isNaN(n) && !this.batches.some(b => b.id === n));

        let html = '';
        if (validNumbers.length > 0) {
            const totalWords = validNumbers.reduce((sum, id) => {
                const batch = this.batches.find(b => b.id === id);
                return sum + (batch?.words.length || 0);
            }, 0);
            html += validNumbers.map(n => `<span class="selected-batch-tag">✓ #${n}</span>`).join('');
            html += `<span style="color:#4CAF50;margin-left:10px">共${totalWords}词</span>`;
        }
        if (invalidNumbers.length > 0) {
            html += `<span class="batch-error">未找到: ${invalidNumbers.join(',')}</span>`;
        }
        container.innerHTML = html;
    }

    startDictation() {
        const input = document.getElementById('batch-numbers').value.trim();
        if (!input) {
            this.showToast('请选择批次');
            return;
        }

        const numbers = input.split(/[,，、\s]+/).map(n => parseInt(n.trim()));
        const validBatches = numbers.filter(n => !isNaN(n) && this.batches.some(b => b.id === n));

        if (validBatches.length === 0) {
            this.showToast('没有有效批次');
            return;
        }

        let words = [];
        validBatches.forEach(batchId => {
            const batch = this.batches.find(b => b.id === batchId);
            if (batch) {
                batch.words.forEach(w => words.push({ ...w, batchId }));
            }
        });

        if (words.length === 0) {
            this.showToast('没有单词');
            return;
        }

        if (document.getElementById('play-order').value === 'random') {
            words = this.shuffleArray(words);
        }

        this.currentDictation = {
            words,
            currentIndex: 0,
            repeatCount: parseInt(document.getElementById('repeat-count').value),
            speechRate: parseFloat(document.getElementById('speech-rate').value),
            accent: document.querySelector('input[name="accent"]:checked').value,
            shortInterval: parseInt(document.getElementById('short-interval').value) * 1000,
            longInterval: parseInt(document.getElementById('long-interval').value) * 1000
        };

        document.getElementById('dictation-setup').style.display = 'none';
        document.getElementById('dictation-progress').style.display = 'block';
        document.getElementById('dictation-result').style.display = 'none';
        document.getElementById('total-count').textContent = words.length;
        document.getElementById('progress-fill').style.width = '0%';

        this.isPaused = false;
        this.isRunning = true;
        document.getElementById('pause-btn').textContent = '暂停';

        console.log('开始听写:', words.length, '个单词，朗读', this.currentDictation.repeatCount, '次');
        this.playAllWords();
    }

    shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // 依次播放所有单词
    async playAllWords() {
        const { words, repeatCount, speechRate, accent, shortInterval, longInterval } = this.currentDictation;

        for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
            if (!this.isRunning) break;

            // 检查暂停
            while (this.isPaused && this.isRunning) {
                await this.delay(200);
            }
            if (!this.isRunning) break;

            const word = words[wordIndex];
            const wordLength = word.word.length;
            const interval = wordLength <= 5 ? shortInterval : longInterval;

            // 更新进度显示
            document.getElementById('current-index').textContent = wordIndex + 1;
            document.getElementById('current-batch').textContent = `批次 #${word.batchId}`;
            document.getElementById('progress-fill').style.width = ((wordIndex / words.length) * 100) + '%';

            console.log(`[${wordIndex + 1}/${words.length}] ${word.word} (${wordLength}字母) - 朗读${repeatCount}次，间隔${interval/1000}秒`);

            // 朗读指定次数
            for (let repeat = 0; repeat < repeatCount; repeat++) {
                if (!this.isRunning) break;
                while (this.isPaused && this.isRunning) {
                    await this.delay(200);
                }
                if (!this.isRunning) break;

                document.getElementById('word-display').innerHTML = `<div class="word-reading">朗读第 ${repeat + 1}/${repeatCount} 次</div>`;
                document.getElementById('repeat-progress').textContent = `单词: ${word.word}`;

                const type = accent === 'US' ? 1 : 2;
                await this.playAudio(word.word, type, speechRate);

                // 朗读之间的间隔（最后一次不间隔）
                if (repeat < repeatCount - 1 && this.isRunning) {
                    document.getElementById('word-display').innerHTML = `<div class="word-waiting">间隔 ${interval/1000} 秒</div>`;
                    await this.delay(interval);
                }
            }

            // 朗读完成后等待书写
            if (this.isRunning) {
                document.getElementById('word-display').innerHTML = `<div class="word-waiting">请书写...</div>`;
                document.getElementById('repeat-progress').textContent = `${wordIndex + 1}/${words.length} 完成，请书写`;
                await this.delay(8000);
            }
        }

        // 所有单词完成
        if (this.isRunning) {
            this.showResult();
        }
    }

    // 播放音频（有道TTS）
    async playAudio(word, type = 1, rate = 0.85) {
        const audioUrl = `https://dict.youdao.com/dictvoice?type=${type}&audio=${encodeURIComponent(word)}`;

        return new Promise((resolve) => {
            const audio = new Audio();

            // 设置超时
            const timeout = setTimeout(() => {
                console.log('音频超时，使用备用方案');
                audio.src = '';
                this.speakFallback(word, type === 1 ? 'US' : 'UK', rate).then(resolve);
            }, 5000);

            audio.onloadeddata = () => {
                clearTimeout(timeout);
                audio.playbackRate = rate;
                audio.play().catch(e => {
                    console.log('播放失败:', e);
                    this.speakFallback(word, type === 1 ? 'US' : 'UK', rate).then(resolve);
                });
            };

            audio.onended = () => {
                clearTimeout(timeout);
                resolve();
            };

            audio.onerror = () => {
                clearTimeout(timeout);
                console.log('音频加载失败');
                this.speakFallback(word, type === 1 ? 'US' : 'UK', rate).then(resolve);
            };

            audio.src = audioUrl;
            audio.load();
        });
    }

    // Web Speech API 备用
    speakFallback(word, accent = 'US', rate = 0.85) {
        return new Promise((resolve) => {
            if (!('speechSynthesis' in window)) {
                resolve();
                return;
            }

            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(word);
            utterance.lang = accent === 'US' ? 'en-US' : 'en-GB';
            utterance.rate = rate;

            utterance.onend = resolve;
            utterance.onerror = resolve;

            // 等待语音列表加载
            const voices = speechSynthesis.getVoices();
            if (voices.length > 0) {
                const targetVoice = voices.find(v =>
                    accent === 'US' ? v.lang.includes('US') : v.lang.includes('GB') || v.lang.includes('UK')
                );
                if (targetVoice) utterance.voice = targetVoice;
            }

            speechSynthesis.speak(utterance);
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        document.getElementById('pause-btn').textContent = this.isPaused ? '继续' : '暂停';
        if (this.isPaused) {
            document.getElementById('word-display').innerHTML = `<div class="word-waiting">已暂停</div>`;
            document.getElementById('repeat-progress').textContent = '点击继续';
        }
    }

    stopDictation() {
        if (confirm('确定停止？')) {
            this.isRunning = false;
            this.isPaused = false;
            this.showResult();
        }
    }

    showResult() {
        this.isRunning = false;
        document.getElementById('dictation-progress').style.display = 'none';
        document.getElementById('dictation-result').style.display = 'block';

        const { words, accent } = this.currentDictation;
        document.getElementById('total-words').textContent = words.length;

        const type = accent === 'US' ? 1 : 2;
        document.getElementById('result-list').innerHTML = words.map(w => `
            <div class="result-item">
                <span class="word-text">${w.word}</span>
                <span class="word-phonetic">${w.phonetic ? `/${w.phonetic}/` : ''}</span>
                <span class="word-meaning">${w.meaning || ''}</span>
                <button class="btn-speak-small" onclick="app.playAudio('${w.word}', ${type})">🔊</button>
            </div>
        `).join('');
    }

    async speakAllResults() {
        const { words, accent } = this.currentDictation;
        const type = accent === 'US' ? 1 : 2;
        this.showToast('朗读全部答案...');
        for (const w of words) {
            await this.playAudio(w.word, type);
            await this.delay(1500);
        }
        this.showToast('完成');
    }

    restartDictation() {
        this.isRunning = false;
        this.isPaused = false;
        document.getElementById('dictation-setup').style.display = 'block';
        document.getElementById('dictation-progress').style.display = 'none';
        document.getElementById('dictation-result').style.display = 'none';
        this.currentDictation = null;
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.batches) {
                    this.batches = data.batches;
                    this.nextBatchId = data.nextBatchId || 1;
                    this.saveData();
                    this.updateBatchIndicator();
                    this.renderBatchList();
                    this.showToast('导入成功');
                }
            } catch (e) {
                this.showToast('导入失败');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    exportData() {
        if (this.batches.length === 0) {
            this.showToast('没有数据');
            return;
        }
        const data = JSON.stringify({ batches: this.batches, nextBatchId: this.nextBatchId }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dictation_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('导出成功');
    }

    clearAll() {
        if (!confirm('确定清空？')) return;
        this.batches = [];
        this.nextBatchId = 1;
        this.saveData();
        this.updateBatchIndicator();
        this.renderBatchList();
        this.showToast('已清空');
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    }
}

const app = new DictationApp();