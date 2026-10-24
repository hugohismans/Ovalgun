import { mount } from 'svelte';
import App from './ui/App.svelte';
import './ui/global.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app introuvable');

export default mount(App, { target });
