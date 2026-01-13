class MusicApp {
    constructor() {
        this.dbName = 'DemoPlayerDB';
        this.dbVersion = 1;
        this.db = null;
        this.audio = new Audio();
        this.tracks = []; // Metadata cache
        this.currentTrackIndex = -1;
        this.isPlaying = false;
        this.isPro = false;
        this.maxFreeTracks = 10;
        this.proKey = 'DEMOPRO2025';

        // UI Elements
        this.elements = {
            fileInput: document.getElementById('file-input'),
            uploadBtn: document.getElementById('upload-btn'),
            playBtn: document.getElementById('play-btn'),
            prevBtn: document.getElementById('prev-btn'),
            nextBtn: document.getElementById('next-btn'),
            playIcon: document.getElementById('play-icon'),
            pauseIcon: document.getElementById('pause-icon'),
            progressBar: document.getElementById('progress-bar'),
            progressContainer: document.getElementById('progress-container'),
            currentTime: document.getElementById('current-time'),
            duration: document.getElementById('duration'),
            playlist: document.getElementById('playlist'),
            trackTitle: document.getElementById('track-title'),
            trackCount: document.getElementById('track-count'),
            toast: document.getElementById('toast'),
            albumArt: document.getElementById('album-art'),
            upgradeBtn: document.getElementById('upgrade-btn'),
            proBadge: document.getElementById('pro-badge'),
            upgradeModal: document.getElementById('upgrade-modal'),
            closeModal: document.querySelector('.close-modal'),
            activationInput: document.getElementById('activation-code'),
            activateBtn: document.getElementById('activate-btn')
        };

        this.init();
    }

    async init() {
        try {
            await this.initDB();
            this.checkProStatus();
            this.setupEventListeners();
            await this.loadPlaylist();
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showToast('Error al iniciar la aplicación');
        }
    }

    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => reject('Database error: ' + event.target.error);

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('tracks')) {
                    db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    setupEventListeners() {
        // Upload
        this.elements.uploadBtn.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // Controls
        this.elements.playBtn.addEventListener('click', () => this.togglePlay());
        this.elements.prevBtn.addEventListener('click', () => this.playPrevious());
        this.elements.nextBtn.addEventListener('click', () => this.playNext());

        // Audio Events
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.playNext(true));
        this.audio.addEventListener('loadedmetadata', () => {
            this.elements.duration.textContent = this.formatTime(this.audio.duration);
        });

        this.elements.progressContainer.addEventListener('click', (e) => {
            const width = this.elements.progressContainer.clientWidth;
            const clickX = e.offsetX;
            const duration = this.audio.duration;
            this.audio.currentTime = (clickX / width) * duration;
        });

        // Pro Mode & Modal
        this.elements.upgradeBtn.addEventListener('click', () => this.elements.upgradeModal.classList.remove('hidden'));
        this.elements.closeModal.addEventListener('click', () => this.elements.upgradeModal.classList.add('hidden'));
        this.elements.upgradeModal.addEventListener('click', (e) => {
            if (e.target === this.elements.upgradeModal) this.elements.upgradeModal.classList.add('hidden');
        });

        this.elements.activateBtn.addEventListener('click', () => this.activatePro(this.elements.activationInput.value));
    }

    checkProStatus() {
        // Check Local Storage
        const storedPro = localStorage.getItem('isPro');
        if (storedPro === 'true') {
            this.isPro = true;
        }

        // Check URL Params
        const urlParams = new URLSearchParams(window.location.search);
        const key = urlParams.get('key');
        if (key === this.proKey) {
            this.activatePro(key, true);
        }

        this.updateProUI();
    }

    activatePro(code, fromUrl = false) {
        if (code === this.proKey) {
            this.isPro = true;
            localStorage.setItem('isPro', 'true');
            this.updateProUI();
            this.elements.upgradeModal.classList.add('hidden');
            this.showToast('¡Modo Pro Activado! 🏆');

            // Clean URL if from URL
            if (fromUrl) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } else {
            this.showToast('Código inválido ❌');
        }
    }

    updateProUI() {
        if (this.isPro) {
            this.elements.upgradeBtn.classList.add('hidden');
            this.elements.proBadge.classList.remove('hidden');
        } else {
            this.elements.upgradeBtn.classList.remove('hidden');
            this.elements.proBadge.classList.add('hidden');
        }
    }

    async handleFileUpload(event) {
        const files = event.target.files;
        if (!files.length) return;

        // Check Limit
        if (!this.isPro && (this.tracks.length + files.length) > this.maxFreeTracks) {
            this.elements.upgradeModal.classList.remove('hidden');
            this.showToast(`Límite de ${this.maxFreeTracks} canciones gratuitas alcanzado`);
            return;
        }

        let addedCount = 0;
        for (const file of files) {
            if (file.type.startsWith('audio/')) {
                try {
                    await this.saveTrack(file);
                    addedCount++;
                } catch (error) {
                    console.error('Error saving file:', error);
                }
            }
        }

        if (addedCount > 0) {
            this.showToast(`${addedCount} tema(s) guardado(s)`);
            await this.loadPlaylist();
        } else {
            this.showToast('No se pudieron cargar los archivos');
        }

        // Reset input
        this.elements.fileInput.value = '';
    }

    saveTrack(file) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            const track = {
                name: file.name,
                blob: file,
                date: new Date()
            };
            const request = store.add(track);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async loadPlaylist() {
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['tracks'], 'readonly');
            const store = transaction.objectStore('tracks');
            const request = store.getAll();

            request.onsuccess = () => {
                this.tracks = request.result;
                this.renderPlaylist();
                resolve();
            };
        });
    }

    renderPlaylist() {
        this.elements.playlist.innerHTML = '';
        this.elements.trackCount.textContent = `${this.tracks.length} temas`;

        if (this.tracks.length === 0) {
            this.elements.playlist.innerHTML = '<li class="playlist-item" style="justify-content:center; color: var(--text-secondary);">No hay temas guardados</li>';
            return;
        }

        this.tracks.forEach((track, index) => {
            const li = document.createElement('li');
            li.className = `playlist-item ${index === this.currentTrackIndex ? 'active' : ''}`;

            li.innerHTML = `
                <div class="track-name">${track.name.replace(/\.[^/.]+$/, "")}</div>
                <button class="delete-btn" aria-label="Eliminar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            `;

            // Click to play
            li.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-btn')) {
                    this.loadTrack(index);
                }
            });

            // Delete action
            const deleteBtn = li.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTrack(track.id);
            });

            this.elements.playlist.appendChild(li);
        });
    }

    async deleteTrack(id) {
        if (!confirm('¿Eliminar este tema?')) return;

        const transaction = this.db.transaction(['tracks'], 'readwrite');
        const store = transaction.objectStore('tracks');
        await store.delete(id);

        // If deleting current track, stop player
        const trackIndex = this.tracks.findIndex(t => t.id === id);
        if (trackIndex === this.currentTrackIndex) {
            this.audio.pause();
            this.audio.src = '';
            this.elements.trackTitle.textContent = 'Selecciona un tema';
            this.isPlaying = false;
            this.updatePlayBtn();
            this.currentTrackIndex = -1;
        }

        this.loadPlaylist();
        this.showToast('Tema eliminado');
    }

    loadTrack(index) {
        if (index < 0 || index >= this.tracks.length) return;

        // Revoke previous URL if needed (browser handles it mostly, but good practice)

        const track = this.tracks[index];
        this.currentTrackIndex = index;

        const fileUrl = URL.createObjectURL(track.blob);
        this.audio.src = fileUrl;
        this.elements.trackTitle.textContent = track.name.replace(/\.[^/.]+$/, ""); // Remove extension

        // Reset progress
        this.elements.progressBar.style.setProperty('--progress', '0%');
        this.elements.currentTime.textContent = '0:00';
        this.elements.duration.textContent = '0:00';

        // Update playlist UI
        this.renderPlaylist(); // To set active class

        this.play();
    }

    togglePlay() {
        if (this.currentTrackIndex === -1 && this.tracks.length > 0) {
            this.loadTrack(0);
        } else if (this.currentTrackIndex !== -1) {
            if (this.isPlaying) {
                this.pause();
            } else {
                this.play();
            }
        }
    }

    play() {
        this.audio.play();
        this.isPlaying = true;
        this.updatePlayBtn();
        // Visualizer effect
        this.elements.albumArt.style.transform = 'scale(1.02)';
        this.elements.albumArt.style.boxShadow = '0 20px 50px -10px rgba(139, 92, 246, 0.5)';
    }

    pause() {
        this.audio.pause();
        this.isPlaying = false;
        this.updatePlayBtn();
        this.elements.albumArt.style.transform = 'scale(1)';
        this.elements.albumArt.style.boxShadow = '0 20px 40px -10px rgba(0, 0, 0, 0.5)';
    }

    playNext(auto = false) {
        if (this.tracks.length === 0) return;
        let nextIndex = this.currentTrackIndex + 1;
        if (nextIndex >= this.tracks.length) {
            nextIndex = 0; // Loop
            if (auto && this.tracks.length > 1) {
                // Loop
            } else if (auto) {
                return; // Stop if only one track
            }
        }
        this.loadTrack(nextIndex);
    }

    playPrevious() {
        if (this.tracks.length === 0) return;
        let prevIndex = this.currentTrackIndex - 1;
        if (prevIndex < 0) prevIndex = this.tracks.length - 1;
        this.loadTrack(prevIndex);
    }

    updatePlayBtn() {
        if (this.isPlaying) {
            this.elements.playIcon.classList.add('hidden');
            this.elements.pauseIcon.classList.remove('hidden');
        } else {
            this.elements.playIcon.classList.remove('hidden');
            this.elements.pauseIcon.classList.add('hidden');
        }
    }

    updateProgress() {
        if (isNaN(this.audio.duration)) return;

        const percent = (this.audio.currentTime / this.audio.duration) * 100;
        this.elements.progressBar.style.setProperty('--progress', `${percent}%`);
        this.elements.currentTime.textContent = this.formatTime(this.audio.currentTime);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    showToast(message) {
        const toast = this.elements.toast;
        toast.textContent = message;
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new MusicApp();
});
