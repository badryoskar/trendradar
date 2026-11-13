import { mountPage } from '../bootstrap';
import { Popup } from './Popup';

function openDashboard() {
  // chrome.tabs.create does not require the "tabs" permission.
  void chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }).then(() => window.close());
}

void mountPage(() => <Popup openDashboard={openDashboard} />);
