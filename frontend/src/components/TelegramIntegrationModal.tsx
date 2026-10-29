import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  Copy, 
  Check, 
  Clock, 
  MessageSquare, 
  Bell, 
  ShieldAlert, 
  Building2, 
  Landmark, 
  Users, 
  Briefcase, 
  HelpCircle,
  ArrowRight,
  Sparkles,
  Smartphone,
  Bot,
  UserCheck,
  CheckCircle2,
  CornerDownLeft,
  FileCheck,
  Lock,
  KeyRound,
  Link,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { DutyOutsideRequest, PRESET_DUTY_REASONS, FIXED_OFFICIAL_APPROVER } from '../types';
import { DutyReasonBadge } from './DutyReasonBadge';
import { autoDetectMissedScans } from '../utils/scanDetection';
import { isHelpOrInstructionInquiry, TELEGRAM_DUTY_INSTRUCTION_MESSAGE } from '../services/telegramBotInstructions';
import { 
  TelegramConfig, 
  getTelegramConfig, 
  saveTelegramConfig, 
  testBotToken, 
  botGroups, 
  sendTelegramMessage, 
  getTelegramUpdates,
  syncTelegramGroupUpdates,
  refreshTelegramConfigFromServer
} from '../services/telegramBotService';
import { TelegramBotGroup } from '../services/api';

interface TelegramIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitFromTelegram: (req: DutyOutsideRequest) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot' | 'system';
  text: string;
  timestamp: string;
  cardData?: {
    reqId: string;
    staff: string;
    reason: string;
    departure: string;
    status: 'pending' | 'returned';
    returnTime?: string;
  };
}

export const TelegramIntegrationModal: React.FC<TelegramIntegrationModalProps> = ({
  isOpen,
  onClose,
  onSubmitFromTelegram
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'template' | 'live_chat' | 'message_parser' | 'return_policy' | 'bot_setup'>('bot_setup');

  // Real Telegram Bot API credentials & state
  const [tgConfig, setTgConfig] = useState<TelegramConfig>(getTelegramConfig());
  const [inputToken, setInputToken] = useState(tgConfig.botToken);
  const [inputGroupChatId, setInputGroupChatId] = useState(tgConfig.groupChatId);
  const [inputShawnChatId, setInputShawnChatId] = useState(tgConfig.shawnChatId);
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saved'>('idle');
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: tgConfig.isConnected ? 'success' : 'idle',
    message: tgConfig.isConnected ? `Connected to @${tgConfig.botUsername}` : ''
  });
  const [isSendingRealTest, setIsSendingRealTest] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [realTestResult, setRealTestResult] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<TelegramBotGroup[]>([]);
  const [groupPickStatus, setGroupPickStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [configLoading, setConfigLoading] = useState(false);

  // Tracks which credential fields the user has hand-edited, so the server
  // config refresh on open never clobbers what they just typed.
  const dirtyFieldsRef = useRef<{ token: boolean; group: boolean; shawn: boolean }>({
    token: false,
    group: false,
    shawn: false
  });

  // Load saved config on open & support Escape key to close
  useEffect(() => {
    if (isOpen) {
      dirtyFieldsRef.current = { token: false, group: false, shawn: false };
      setConfigLoading(true);
      const saved = getTelegramConfig();
      setTgConfig(saved);
      setInputToken(saved.botToken);
      setInputGroupChatId(saved.groupChatId);
      setInputShawnChatId(saved.shawnChatId);
      if (saved.isConnected) {
        setTokenStatus({
          type: 'success',
          message: `Connected to @${saved.botUsername}`
        });
      }

      // Pull the authoritative config from the backend — but only fill in
      // fields the user has NOT edited yet (never reset a typed value).
      refreshTelegramConfigFromServer().then((latest) => {
        if (latest.botToken || latest.groupChatId || latest.shawnChatId) {
          setTgConfig(latest);
          if (!dirtyFieldsRef.current.token && latest.botToken) {
            setInputToken(latest.botToken);
          }
          if (!dirtyFieldsRef.current.group && latest.groupChatId) {
            setInputGroupChatId(latest.groupChatId);
          }
          if (!dirtyFieldsRef.current.shawn && latest.shawnChatId) {
            setInputShawnChatId(latest.shawnChatId);
          }
          setTokenStatus({
            type: latest.isConnected ? 'success' : 'idle',
            message: latest.isConnected ? `Connected to @${latest.botUsername}` : ''
          });
        }
      }).catch(() => {
        // Server config unavailable (e.g. backend offline) — keep local values.
      }).finally(() => {
        setConfigLoading(false);
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Interactive message generator states
  const [staffName, setStaffName] = useState('Sok Mouy');
  const [otherStaff, setOtherStaff] = useState('Vibol Kim');
  const [position, setPosition] = useState('Senior Accountant');
  const [reasonPreset, setReasonPreset] = useState('Go to bank');
  const [otherReasonText, setOtherReasonText] = useState('');
  const [departureTime, setDepartureTime] = useState('10:00');
  const [returnStatus, setReturnStatus] = useState<'pending' | 'fixed' | 'direct_home'>('pending');
  const [fixedReturnTime, setFixedReturnTime] = useState('14:30');
  const [missedScans, setMissedScans] = useState('Lunch Out, Lunch In');
  const approver = FIXED_OFFICIAL_APPROVER;

  // Auto-detect scans in Template Generator
  useEffect(() => {
    const isPending = returnStatus === 'pending';
    const isDirectHome = returnStatus === 'direct_home';
    const retTime = isPending ? null : (isDirectHome ? '17:00' : fixedReturnTime);
    const result = autoDetectMissedScans(departureTime, retTime, isPending, isDirectHome);
    if (result.scans.length > 0) {
      setMissedScans(result.scans.join(', '));
    } else {
      setMissedScans('None');
    }
  }, [departureTime, returnStatus, fixedReturnTime]);

  // Parser state
  const [rawPastedMessage, setRawPastedMessage] = useState('');
  const [parsedPreview, setParsedPreview] = useState<Partial<DutyOutsideRequest> | null>(null);
  const [parseSuccessMsg, setParseSuccessMsg] = useState('');
  const [parseErrorMsg, setParseErrorMsg] = useState('');

  // Live Chat Simulator state (Dual-channel: Group chat + Mr. Shawn 1-on-1 direct alerts)
  const [chatChannel, setChatChannel] = useState<'group' | 'shawn_dm'>('group');
  const [chatInput, setChatInput] = useState('');
  const [activeChatReq, setActiveChatReq] = useState<DutyOutsideRequest | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'bot',
      text: '👋 Welcome to the APA Staff Duty Outside Group Chat!\n\nStaff can drop their duty requests here (e.g. Sok Mouy — Go to bank — Departure: 10:00). The bot will automatically update the system and alert Mr. Shawn immediately.',
      timestamp: '09:00'
    }
  ]);
  const [shawnMessages, setShawnMessages] = useState<ChatMessage[]>([
    {
      id: 'sm1',
      sender: 'bot',
      text: '👋 Hello Mr. Shawn (General Manager).\nYou are connected to @APA_DutyBot for Superior Direct Alerts.\n\nWhenever staff drop duty requests or record their return in the Staff Telegram Group, the bot will automatically update the system and push private alerts directly to your chat here.',
      timestamp: '08:30'
    }
  ]);
  const [shawnUnread, setShawnUnread] = useState<number>(0);

  const handleProcessIncomingChat = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (chatChannel === 'group') {
      // 1. Check if user is asking for instructions or how to fill
      if (isHelpOrInstructionInquiry(trimmed)) {
        setChatMessages(prev => [
          ...prev,
          { id: `u-${Date.now()}`, sender: 'user', text: trimmed, timestamp: new Date().toTimeString().slice(0, 5) },
          { 
            id: `b-${Date.now()}`, 
            sender: 'bot', 
            text: `📋 APA DUTY OUTSIDE — SUBMISSION GUIDE & TEMPLATE\n\nCopy and send this into the group:\n\nDuty Outside Request\n1. Requester: [Your Name]\n2. Staff on Duty: [All Staff Names]\n3. Position: [Job Title]\n4. Reason: [Go to bank / Go to GDT / Go to meet GDT / Doing CFO tasks / Other]\n5. Other Teams: None\n6. Date: ${new Date().toISOString().split('T')[0]}\n7. Departure: [e.g. 10:30 AM]\n8. Return: [e.g. 12:30 PM, Pending, or Direct to Home]\n9. Missed Scans: [Morning In / Lunch Out / Lunch In / Evening Out / Full Day / None]\n10. Approved By: Mr. Shawn (General Manager)\n\n───────────────\n💡 TIP: If you leave it as 'Pending', you can reply:\n• 'Returned DOR-${new Date().getFullYear()}-XXXX 17:30' (with time)\n• 'Returned DOR-${new Date().getFullYear()}-XXXX now' (auto Cambodia time)\nIf it's the end of shift, write 'Direct to Home' to excuse the Evening Out scan!`, 
            timestamp: new Date().toTimeString().slice(0, 5) 
          }
        ]);
        return;
      }

      // 2. Check if user is replying with return update
      if (trimmed.toLowerCase().startsWith('/return') || trimmed.toLowerCase().includes('return') || trimmed.toLowerCase().includes('back in office')) {
        const time = trimmed.replace('/return', '').replace(/returned at/i, '').replace(/return at/i, '').replace(/return/i, '').trim() || new Date().toTimeString().slice(0, 5);
        setChatMessages(prev => [
          ...prev,
          { id: `u-${Date.now()}`, sender: 'user', text: trimmed, timestamp: new Date().toTimeString().slice(0, 5) },
          { id: `b-${Date.now()}`, sender: 'bot', text: `🏢 RETURN CONFIRMED at ${time}!\nStatus: ✅ Record Completed & Reconciled for Odoo Attendance.\n\nThank you for updating on the same day in accordance with the Same-Day Return Policy.`, timestamp: new Date().toTimeString().slice(0, 5) }
        ]);
        return;
      }

      // 3. General message fallback
      setChatMessages(prev => [
        ...prev,
        { id: `u-${Date.now()}`, sender: 'user', text: trimmed, timestamp: new Date().toTimeString().slice(0, 5) },
        { id: `b-${Date.now()}`, sender: 'bot', text: `Received: "${trimmed}".\n\n💡 Need the duty template? Type: "how to fill" or "pls give me the instruction".\nTo update your return: type "Returned DOR-${new Date().getFullYear()}-XXXX 17:30" or "Returned DOR-${new Date().getFullYear()}-XXXX now".`, timestamp: new Date().toTimeString().slice(0, 5) }
      ]);
    } else {
      // Mr. Shawn private chat
      setShawnMessages(prev => [
        ...prev,
        { id: `sm-${Date.now()}`, sender: 'user', text: trimmed, timestamp: new Date().toTimeString().slice(0, 5) },
        { id: `sb-${Date.now()}`, sender: 'bot', text: `Noted, Mr. Shawn. Your instructions are recorded in the duty audit log.`, timestamp: new Date().toTimeString().slice(0, 5) }
      ]);
    }
  };

  if (!isOpen) return null;

  const finalReason = reasonPreset === 'Other' ? (otherReasonText.trim() || 'Official duty') : reasonPreset;
  const returnDisplay = returnStatus === 'pending' 
    ? 'Pending (Will update upon return)' 
    : (returnStatus === 'direct_home' ? 'Direct to Home (End of Day)' : fixedReturnTime);
  const dutyStaffCombined = otherStaff.trim() ? `${staffName}, ${otherStaff}` : staffName;

  const generatedTelegramMessage = `📋 DUTY OUTSIDE REQUEST
1. Requester: ${staffName}
2. Staff on Duty: ${dutyStaffCombined}
3. Position: ${position}
4. Reason: ${finalReason}
5. Other Teams: None
6. Date: ${new Date().toISOString().split('T')[0]}
7. Departure: ${departureTime}
8. Return: ${returnDisplay}
9. Missed Scans: ${missedScans || 'None'}
10. Approved By: ${approver}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedTelegramMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSimulateSubmit = () => {
    const today = new Date().toISOString().split('T')[0];
    const newId = `DOR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const isPending = returnStatus === 'pending';
    const effectiveReturnTime = isPending ? null : (returnStatus === 'direct_home' ? '17:00' : fixedReturnTime);

    const newRequest: DutyOutsideRequest = {
      id: newId,
      requesterName: staffName,
      employeesOnDuty: dutyStaffCombined.split(',').map(s => s.trim()).filter(Boolean),
      position: position,
      reasonOrPurpose: finalReason,
      otherTeamsInvolved: 'None',
      date: today,
      timeOfDeparture: departureTime,
      timeOfReturn: effectiveReturnTime,
      isReturnPending: isPending,
      missedFingerprintScans: missedScans.split(',').map(s => s.trim()).filter(Boolean),
      approvedBy: approver,
      status: isPending ? 'active' : 'returned',
      createdAt: new Date().toISOString()
    };

    onSubmitFromTelegram(newRequest);
    onClose();
  };

  // Parser helper function
  const handleParseMessage = () => {
    if (!rawPastedMessage.trim()) {
      setParsedPreview(null);
      setParseSuccessMsg('');
      setParseErrorMsg('Paste a Telegram duty request message first, then press Parse & Validate.');
      return;
    }
    const lines = rawPastedMessage.split('\n').map(l => l.trim());
    let reqName = 'Staff Member';
    let dutyStaff: string[] = [];
    let pos = 'Staff';
    let reason = 'Official Duty';
    let teams = 'None';
    let reqDate = new Date().toISOString().split('T')[0];
    let dep = '09:00';
    let ret: string | null = null;
    let isPending = true;
    let scans: string[] = [];
    let app = 'Department Head';

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('1.') || lower.includes('requester:')) {
        reqName = line.replace(/^(1\.|\*1\.\*|\s*Requester:)\s*/i, '').replace(/requester:\s*/i, '').trim();
      } else if (lower.startsWith('2.') || lower.includes('staff on duty:')) {
        const rawStaff = line.replace(/^(2\.|\*2\.\*|\s*Staff on Duty:)\s*/i, '').replace(/staff on duty:\s*/i, '').trim();
        dutyStaff = rawStaff.split(',').map(s => s.trim()).filter(Boolean);
      } else if (lower.startsWith('3.') || lower.includes('position:')) {
        pos = line.replace(/^(3\.|\*3\.\*|\s*Position:)\s*/i, '').replace(/position:\s*/i, '').trim();
      } else if (lower.startsWith('4.') || lower.includes('reason:')) {
        reason = line.replace(/^(4\.|\*4\.\*|\s*Reason:)\s*/i, '').replace(/reason:\s*/i, '').trim();
      } else if (lower.startsWith('5.') || lower.includes('other teams:')) {
        teams = line.replace(/^(5\.|\*5\.\*|\s*Other Teams:)\s*/i, '').replace(/other teams:\s*/i, '').trim();
      } else if (lower.startsWith('6.') || lower.includes('date:')) {
        reqDate = line.replace(/^(6\.|\*6\.\*|\s*Date:)\s*/i, '').replace(/date:\s*/i, '').trim();
      } else if (lower.startsWith('7.') || lower.includes('departure:')) {
        dep = line.replace(/^(7\.|\*7\.\*|\s*Departure:)\s*/i, '').replace(/departure:\s*/i, '').trim();
      } else if (lower.startsWith('8.') || lower.includes('return:')) {
        const rawRet = line.replace(/^(8\.|\*8\.\*|\s*Return:)\s*/i, '').replace(/return:\s*/i, '').trim();
        if (rawRet.toLowerCase().includes('pending') || rawRet.toLowerCase().includes('will update')) {
          ret = null;
          isPending = true;
        } else {
          ret = rawRet;
          isPending = false;
        }
      } else if (lower.startsWith('9.') || lower.includes('missed scans:')) {
        const rawScans = line.replace(/^(9\.|\*9\.\*|\s*Missed Scans:)\s*/i, '').replace(/missed scans:\s*/i, '').trim();
        if (rawScans.toLowerCase() !== 'none') {
          scans = rawScans.split(',').map(s => s.trim()).filter(Boolean);
        }
      } else if (lower.startsWith('10.') || lower.includes('approved by:')) {
        app = line.replace(/^(10\.|\*10\.\*|\s*Approved By:)\s*/i, '').replace(/approved by:\s*/i, '').trim();
      }
    }

    if (dutyStaff.length === 0) {
      dutyStaff = [reqName];
    }

    // Auto-detect scans if none specified or general term used
    if (scans.length === 0 || scans.some(s => s.toLowerCase().includes('auto') || s.toLowerCase().includes('all') || s.toLowerCase().includes('full day'))) {
      const isDirectHome = ret ? ret.toLowerCase().includes('home') : false;
      const detected = autoDetectMissedScans(dep, ret, isPending, isDirectHome);
      if (detected.scans.length > 0) {
        scans = detected.scans;
      }
    }

    const parsedObj: Partial<DutyOutsideRequest> = {
      requesterName: reqName,
      employeesOnDuty: dutyStaff,
      position: pos,
      reasonOrPurpose: reason,
      otherTeamsInvolved: teams,
      date: reqDate,
      timeOfDeparture: dep,
      timeOfReturn: ret,
      isReturnPending: isPending,
      missedFingerprintScans: scans,
      approvedBy: app
    };

    setParsedPreview(parsedObj);
    setParseSuccessMsg('Message parsed successfully! All 10 duty criteria extracted.');
    setParseErrorMsg('');
  };

  const handleImportParsed = () => {
    if (!parsedPreview) return;
    const newId = `DOR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const fullRequest: DutyOutsideRequest = {
      id: newId,
      requesterName: parsedPreview.requesterName || 'Staff Member',
      employeesOnDuty: parsedPreview.employeesOnDuty || ['Staff Member'],
      position: parsedPreview.position || 'Staff',
      reasonOrPurpose: parsedPreview.reasonOrPurpose || 'Official Duty',
      otherTeamsInvolved: parsedPreview.otherTeamsInvolved || 'None',
      date: parsedPreview.date || new Date().toISOString().split('T')[0],
      timeOfDeparture: parsedPreview.timeOfDeparture || '09:00',
      timeOfReturn: parsedPreview.timeOfReturn || null,
      isReturnPending: parsedPreview.isReturnPending !== false,
      missedFingerprintScans: parsedPreview.missedFingerprintScans || [],
      approvedBy: parsedPreview.approvedBy || 'Department Head',
      status: parsedPreview.isReturnPending ? 'active' : 'returned',
      createdAt: new Date().toISOString()
    };
    onSubmitFromTelegram(fullRequest);
    onClose();
  };

  // Live Chat Simulator Actions
  const handleSendChatRequest = () => {
    const nowTime = new Date().toTimeString().slice(0, 5);
    const today = new Date().toISOString().split('T')[0];
    const newId = `DOR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    const newRequest: DutyOutsideRequest = {
      id: newId,
      requesterName: staffName,
      employeesOnDuty: dutyStaffCombined.split(',').map(s => s.trim()).filter(Boolean),
      position: position,
      reasonOrPurpose: finalReason,
      otherTeamsInvolved: 'None',
      date: today,
      timeOfDeparture: departureTime,
      timeOfReturn: null,
      isReturnPending: true,
      missedFingerprintScans: missedScans.split(',').map(s => s.trim()).filter(Boolean),
      approvedBy: approver,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    setActiveChatReq(newRequest);

    // 1. Post in Staff Telegram Group
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: generatedTelegramMessage,
      timestamp: nowTime
    };

    const botMsg: ChatMessage = {
      id: `b-${Date.now()}`,
      sender: 'bot',
      text: `✅ DUTY OUTSIDE REGISTERED & VERIFIED\nRef: ${newId}\nStaff: ${dutyStaffCombined}\nPurpose: ${finalReason}\nDeparture: ${departureTime}\nReturn: 🟡 Pending (Same-Day Update Policy)\n\n⚡ Live System: Record automatically saved & synced to dashboard\n🔔 Superior Alert: Private notification dispatched to Mr. Shawn\n\nPlease tap the button below when you return to office today:`,
      timestamp: nowTime,
      cardData: {
        reqId: newId,
        staff: dutyStaffCombined,
        reason: finalReason,
        departure: departureTime,
        status: 'pending'
      }
    };

    setChatMessages(prev => [...prev, userMsg, botMsg]);

    // 2. Dispatch Direct 1-on-1 Alert to Mr. Shawn's Personal Telegram
    const shawnAlert: ChatMessage = {
      id: `sm-alert-${Date.now()}`,
      sender: 'bot',
      text: `🔔 [NEW DUTY OUTSIDE ALERT]\nRef: ${newId}\nRequester: ${staffName} (${position})\nStaff on Duty: ${dutyStaffCombined}\nPurpose: ${finalReason}\nDeparture: ${departureTime} | Date: ${today}\nReturn Status: 🟡 Pending (Same-Day Policy)\nMissed Scans: ${missedScans || 'None'}\n\n⚡ System Status: Automatically Synced & Logged in App\nApproved Authority: Mr. Shawn (Fixed)`,
      timestamp: nowTime,
      cardData: {
        reqId: newId,
        staff: dutyStaffCombined,
        reason: finalReason,
        departure: departureTime,
        status: 'pending'
      }
    };
    setShawnMessages(prev => [...prev, shawnAlert]);
    if (chatChannel === 'group') {
      setShawnUnread(prev => prev + 1);
    }

    // 3. Update Database in App
    onSubmitFromTelegram(newRequest);

    // 4. If Real Telegram Bot is Connected, dispatch live alerts via Telegram API
    if (tgConfig.isConnected && tgConfig.botToken) {
      if (tgConfig.groupChatId) {
        sendTelegramMessage(
          tgConfig.botToken,
          tgConfig.groupChatId,
          `<b>📋 DUTY OUTSIDE REGISTERED</b>\n\n<b>Ref:</b> <code>${newId}</code>\n<b>Staff:</b> ${dutyStaffCombined}\n<b>Purpose:</b> ${finalReason}\n<b>Departure:</b> ${departureTime}\n<b>Return Status:</b> 🟡 Pending (Same-Day Policy)\n\n<i>Staff: Please update return time on the same day without fail.</i>`,
          'HTML'
        ).catch(err => console.error('Failed to send to Telegram group:', err));
      }

      if (tgConfig.shawnChatId) {
        sendTelegramMessage(
          tgConfig.botToken,
          tgConfig.shawnChatId,
          `<b>🔔 NEW DUTY OUTSIDE ALERT FOR MR. SHAWN</b>\n\n<b>Ref:</b> <code>${newId}</code>\n<b>Requester:</b> ${staffName} (${position})\n<b>Staff on Duty:</b> ${dutyStaffCombined}\n<b>Purpose:</b> ${finalReason}\n<b>Departure:</b> ${departureTime} | <b>Date:</b> ${today}\n<b>Return:</b> 🟡 Pending (Same-Day Policy)\n<b>Missed Scans:</b> ${missedScans || 'None'}\n\n⚡ <i>System status: Automatically synced in movement register.</i>`,
          'HTML'
        ).catch(err => console.error('Failed to send to Mr. Shawn telegram:', err));
      }
    }
  };

  const handleBotTapReturn = (cardReqId: string) => {
    const currentTime = new Date().toTimeString().slice(0, 5);

    // If Real Telegram Bot is Connected, send return update
    if (tgConfig.isConnected && tgConfig.botToken) {
      if (tgConfig.groupChatId) {
        sendTelegramMessage(
          tgConfig.botToken,
          tgConfig.groupChatId,
          `<b>🏢 RETURN TO OFFICE CONFIRMED</b>\n\n<b>Ref:</b> <code>${cardReqId}</code>\n<b>Staff:</b> ${dutyStaffCombined}\n<b>Returned at:</b> ${currentTime}\n<b>Status:</b> ✅ Record Closed & Reconciled`,
          'HTML'
        ).catch(err => console.error('Failed to send return to Telegram group:', err));
      }
      if (tgConfig.shawnChatId) {
        sendTelegramMessage(
          tgConfig.botToken,
          tgConfig.shawnChatId,
          `<b>🏢 STAFF RETURN NOTIFICATION FOR MR. SHAWN</b>\n\n<b>Ref:</b> <code>${cardReqId}</code>\n<b>Staff:</b> ${dutyStaffCombined}\n<b>Purpose:</b> ${finalReason}\n<b>Returned to Office:</b> ${currentTime}\n<b>Status:</b> ✅ Record Completed & Attendance Cleared`,
          'HTML'
        ).catch(err => console.error('Failed to send return to Mr. Shawn:', err));
      }
    }

    // Update in group chat
    setChatMessages(prev =>
      prev.map(m => {
        if (m.cardData && m.cardData.reqId === cardReqId) {
          return {
            ...m,
            cardData: {
              ...m.cardData,
              status: 'returned' as const,
              returnTime: currentTime
            }
          };
        }
        return m;
      }).concat([
        {
          id: `b-ret-${Date.now()}`,
          sender: 'bot',
          text: `🏢 RETURN CONFIRMED at ${currentTime}!\nRef: ${cardReqId}\nStatus: ✅ Returned to Office (Record Completed)\n\nThank you for updating on the same day in accordance with the Same-Day Return Policy. Your fingerprint reconciliation is now clear.`,
          timestamp: currentTime
        }
      ])
    );

    // Also notify Mr. Shawn in his personal 1-on-1 chat
    const shawnReturnAlert: ChatMessage = {
      id: `sm-ret-${Date.now()}`,
      sender: 'bot',
      text: `🏢 [STAFF RETURN NOTIFICATION]\nRef: ${cardReqId}\nStaff: ${dutyStaffCombined}\nPurpose: ${finalReason}\nReturned to Office: ${currentTime}\nStatus: ✅ Record Completed & Attendance Cleared\n\nAll missed fingerprint scans have been reconciled.`,
      timestamp: currentTime
    };
    setShawnMessages(prev => [...prev, shawnReturnAlert]);
    if (chatChannel === 'group') {
      setShawnUnread(prev => prev + 1);
    }
  };

  const handleShawnAcknowledge = () => {
    const currentTime = new Date().toTimeString().slice(0, 5);
    const ackMsg: ChatMessage = {
      id: `sm-ack-${Date.now()}`,
      sender: 'user',
      text: `👍 Noted and acknowledged.`,
      timestamp: currentTime
    };
    const botReply: ChatMessage = {
      id: `b-ack-${Date.now()}`,
      sender: 'bot',
      text: `✅ Acknowledgment logged for Mr. Shawn. System status remains active and verified.`,
      timestamp: currentTime
    };
    setShawnMessages(prev => [...prev, ackMsg, botReply]);
  };

  const handleTrigger5PMAlert = () => {
    const alertMsg: ChatMessage = {
      id: `alert-${Date.now()}`,
      sender: 'bot',
      text: `⚠️ [17:00 DAILY ATTENDANCE ALERT]\nReminder for ${staffName}: Your Duty Outside record (${activeChatReq?.id || `DOR-${new Date().getFullYear()}-XXXX`}) is still marked as Pending Return.\n\nStaff must update their return time on the same day without fail to avoid an incomplete attendance record.\n\nTap below or reply with your return time (e.g. /return 17:15).`,
      timestamp: '17:00',
      cardData: activeChatReq ? {
        reqId: activeChatReq.id,
        staff: activeChatReq.requesterName,
        reason: activeChatReq.reasonOrPurpose,
        departure: activeChatReq.timeOfDeparture,
        status: 'pending'
      } : undefined
    };

    setChatMessages(prev => [...prev, alertMsg]);

    // Also alert Mr. Shawn at 5 PM if pending
    const shawnPendingAlert: ChatMessage = {
      id: `sm-5pm-${Date.now()}`,
      sender: 'bot',
      text: `⚠️ [17:00 PENDING RETURN SUMMARY FOR MR. SHAWN]\nStaff ${staffName} (${dutyStaffCombined}) has not yet updated return time for today.\n\nSystem will continue monitoring for same-day return completion before attendance reconciliation closes.`,
      timestamp: '17:00'
    };
    setShawnMessages(prev => [...prev, shawnPendingAlert]);
    if (chatChannel === 'group') {
      setShawnUnread(prev => prev + 1);
    }
  };

  // Real Bot Setup Action Handlers
  const handlePickGroup = (group: TelegramBotGroup) => {
    const value = group.username ? `@${group.username}` : String(group.id);
    dirtyFieldsRef.current.group = true;
    setInputGroupChatId(value);
    setTgConfig((prev) => ({ ...prev, groupChatId: value, groupTitle: group.title }));
    setGroupPickerOpen(false);
    setGroupPickStatus({
      type: 'success',
      message: `Linked Staff Group: ${group.title}${group.username ? ` (@${group.username})` : ''}`
    });
  };

  const handleValidateBotToken = async () => {
    if (!inputToken.trim()) {
      setTokenStatus({ type: 'error', message: 'Please enter your Bot Token from @BotFather' });
      return;
    }

    setIsValidatingToken(true);
    setTokenStatus({ type: 'idle', message: '' });
    setGroupPickStatus({ type: 'idle', message: '' });

    try {
      const res = await testBotToken(inputToken.trim());

      if (res.success && res.bot) {
        const updatedConfig: TelegramConfig = {
          ...tgConfig,
          botToken: inputToken.trim(),
          botUsername: res.bot.username,
          botDisplayName: res.bot.firstName,
          groupChatId: inputGroupChatId.trim(),
          shawnChatId: inputShawnChatId.trim(),
          isConnected: true
        };
        setTgConfig(updatedConfig);
        setTokenStatus({
          type: 'success',
          message: `Verified! Connected to @${res.bot.username} (${res.bot.firstName})`
        });
        setSaveIndicator('saved');
        setTimeout(() => setSaveIndicator('idle'), 3000);

        try {
          // After a successful verify, list the groups the bot belongs to so the
          // admin can link one. If the bot is not in any group, tell them how.
          const groupsRes = await botGroups(inputToken.trim());
          if (groupsRes.success && groupsRes.groups && groupsRes.groups.length > 0) {
            setAvailableGroups(groupsRes.groups);
            setGroupPickerOpen(true);
          } else {
            setGroupPickStatus({
              type: 'error',
              message:
                'No group found for this bot yet. If your bot is already in your Staff Group, post any message inside the group now (or have a staff member post), then press Verify again. If it is not in a group yet, add it as an Administrator — follow the blue "How to find the Staff Group Chat ID" guide in the "2. Staff Group" section.'
            });
          }
        } catch (err: any) {
          setGroupPickStatus({
            type: 'error',
            message: err?.message || 'Could not fetch the group list. Please check your internet connection and try again.'
          });
        }
      } else {
        setTokenStatus({
          type: 'error',
          message: res.error || 'Token verification failed. Please check the token format.'
        });
      }
    } catch (err: any) {
      setTokenStatus({
        type: 'error',
        message: err?.message || 'Fetch failed — could not reach the server. Please check your internet connection and try again.'
      });
    }
    setIsValidatingToken(false);
  };

  const handleSaveBotSettings = () => {
    if (!inputGroupChatId.trim()) {
      setGroupPickStatus({
        type: 'error',
        message: 'Linking a Staff Telegram Group is required before saving. Click "Verify Bot Token" and pick your group from the list, or paste the Group Chat ID / @username — follow the blue "How to find the Staff Group Chat ID" guide in the "2. Staff Group" section.'
      });
      return;
    }
    const updatedConfig: TelegramConfig = {
      ...tgConfig,
      botToken: inputToken.trim(),
      groupChatId: inputGroupChatId.trim(),
      shawnChatId: inputShawnChatId.trim(),
      isConnected: tgConfig.isConnected || !!inputToken.trim()
    };
    setTgConfig(updatedConfig);
    saveTelegramConfig(updatedConfig);
    setSaveIndicator('saved');
    setRealTestResult({
      type: 'success',
      message: '✅ Telegram settings saved to the backend server!'
    });
    setTimeout(() => {
      setRealTestResult({ type: 'idle', message: '' });
      setSaveIndicator('idle');
    }, 4000);
  };

  const handleSendRealTestAlert = async (target: 'group' | 'shawn') => {
    const activeToken = inputToken.trim() || tgConfig.botToken;
    if (!activeToken) {
      setRealTestResult({
        type: 'error',
        message: 'Please connect and verify your Bot Token first!'
      });
      return;
    }

    const targetChatId = target === 'group' ? inputGroupChatId.trim() : inputShawnChatId.trim();
    if (!targetChatId) {
      setRealTestResult({
        type: 'error',
        message: `Please provide the ${target === 'group' ? 'Staff Group Chat ID' : "Mr. Shawn's Chat ID"} first!`
      });
      return;
    }

    setIsSendingRealTest(true);
    setRealTestResult({ type: 'idle', message: '' });

    const testText = target === 'group'
      ? `<b>🏢 APA DUTY OUTSIDE SYSTEM TEST</b>\n\n✅ <b>Connected Successfully!</b>\nThis Staff Telegram Group is now paired with the APA Duty Outside Movement Register.\n\n<i>Staff can post their 10-item requests here.</i>`
      : `<b>🔔 APA SUPERIOR DIRECT ALERT TEST</b>\n\nHello <b>Mr. Shawn</b>,\n✅ Your private Telegram channel is now paired with @${tgConfig.botUsername || 'APA_DutyBot'}.\n\nYou will receive 1-on-1 private alerts whenever staff submit duty outside requests or complete same-day returns.`;

    const res = await sendTelegramMessage(activeToken, targetChatId, testText, 'HTML');
    setIsSendingRealTest(false);

    if (res.success) {
      setRealTestResult({
        type: 'success',
        message: `Test message sent to Telegram ${target === 'group' ? 'Staff Group' : "Mr. Shawn"} (Message ID #${res.messageId})!`
      });
    } else {
      let errorMsg = res.error || 'Unknown error';
      if (errorMsg.toLowerCase().includes("bot can't initiate conversation") || errorMsg.toLowerCase().includes("can't initiate conversation") || (errorMsg.toLowerCase().includes("forbidden") && errorMsg.toLowerCase().includes("initiate"))) {
        const uname = tgConfig.botUsername ? `@${tgConfig.botUsername}` : 'your bot';
        errorMsg = `Cannot send message. Please open a private chat with ${uname} and tap Start (or type /start) first. Once done, click "Test Mr. Shawn Alert" again.`;
      } else if (errorMsg.toLowerCase().includes("chat not found")) {
        const uname = tgConfig.botUsername ? `@${tgConfig.botUsername}` : 'your bot';
        errorMsg = `Chat not found. Check that Mr. Shawn's Chat ID is correct (numeric ID, not username). Open a private chat with ${uname} and tap Start (or type /start) first, then click "Test Mr. Shawn Alert" again.`;
      } else if (errorMsg.toLowerCase().includes("user is deactivated") || errorMsg.toLowerCase().includes("blocked by the user")) {
        errorMsg = `Cannot send to this chat. The user may have blocked ${tgConfig.botUsername ? `@${tgConfig.botUsername}` : 'the bot'} or deactivated their account.`;
      } else if (errorMsg.toLowerCase().includes("group chat was migrated")) {
        errorMsg = `Group was migrated to a supergroup. Please get the new Chat ID and update the Staff Group Chat ID.`;
      }
      setRealTestResult({
        type: 'error',
        message: `Failed: ${errorMsg}`
      });
    }
  };

  const handleSyncGroupMessagesNow = async (resetOffset: boolean = false) => {
    setIsSyncingNow(true);
    setRealTestResult({ type: 'idle', message: '' });
    try {
      const result = await syncTelegramGroupUpdates(
        (newReq) => {
          onSubmitFromTelegram(newReq);
        },
        (reqId, returnTime, senderName) => {
          // Reconcile return
          console.log('Return synced:', reqId, returnTime, senderName);
        },
        resetOffset,
        (requestId, senderName) => {
          setRealTestResult({
            type: 'error',
            message: `Duplicate blocked — ${senderName || 'Staff'}'s request (Ref ${requestId}) was already submitted. No new record created; staff were notified in the Telegram group.`
          });
        }
      );

      if (result.error) {
        setRealTestResult({
          type: 'error',
          message: `Sync issue: ${result.error}. (Ensure bot has privacy mode disabled in BotFather: /setprivacy -> Disable)`
        });
      } else {
        setRealTestResult({
          type: 'success',
          message: `Sync complete! Checked ${result.checked} updates. Imported: ${result.imported} request(s), Processed returns: ${result.returnedCount || 0}.${resetOffset ? ' (Deep offset reset performed)' : ''}`
        });
      }
    } catch (err: any) {
      setRealTestResult({
        type: 'error',
        message: `Error syncing: ${err.message}`
      });
    } finally {
      setIsSyncingNow(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        // Close if clicked directly on the dark backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-auto max-h-[94vh] sm:max-h-[92vh] flex flex-col min-w-0 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading overlay while fetching config from the backend */}
        {configLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-sky-600 animate-spin" />
            </div>
            <p className="text-xs font-semibold text-slate-600">Fetching Telegram configuration...</p>
          </div>
        )}
        {/* Header - Mobile Responsive with Guaranteed-Visible Close Button */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-sky-900 to-slate-900 text-white flex items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0">
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-sm sm:text-base md:text-lg font-bold truncate leading-snug">
                  Telegram Bot & Integration
                </h2>
                <span className="bg-sky-500/30 text-sky-200 text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded-full border border-sky-400/30 shrink-0">
                  Staff Group + Mr. Shawn
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-sky-200/90 truncate">
                Live Group Sync &bull; Mr. Shawn Alerts &bull; Same-Day Return
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-white bg-white/15 hover:bg-white/25 active:bg-white/35 border border-white/20 transition-colors shrink-0 flex items-center justify-center shadow-xs"
            aria-label="Close dialog"
            title="Close"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Navigation Tabs - Horizontally Scrollable without pushing container */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-2 sm:px-6 pt-2 overflow-x-auto no-scrollbar w-full max-w-full shrink-0">
          <button
            onClick={() => setActiveTab('bot_setup')}
            className={`px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center whitespace-nowrap shrink-0 ${
              activeTab === 'bot_setup'
                ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-lg'
                : 'border-transparent text-emerald-700 hover:text-emerald-900 bg-emerald-50/50'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
            Connect Real Bot (API Token)
            {tgConfig.isConnected && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-emerald-500"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('template')}
            className={`px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center whitespace-nowrap shrink-0 ${
              activeTab === 'template'
                ? 'border-sky-600 text-sky-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            1. Message Generator & Presets
          </button>
          <button
            onClick={() => {
              setActiveTab('live_chat');
              setShawnUnread(0);
            }}
            className={`px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center whitespace-nowrap shrink-0 relative ${
              activeTab === 'live_chat'
                ? 'border-sky-600 text-sky-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bot className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
            2. Live Bot Simulator (Group + Mr. Shawn)
            {shawnUnread > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                {shawnUnread}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('message_parser')}
            className={`px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center whitespace-nowrap shrink-0 ${
              activeTab === 'message_parser'
                ? 'border-sky-600 text-sky-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5 mr-1.5" />
            3. Paste & Parse Message
          </button>
          <button
            onClick={() => setActiveTab('return_policy')}
            className={`px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center whitespace-nowrap shrink-0 ${
              activeTab === 'return_policy'
                ? 'border-sky-600 text-sky-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            4. Same-Day Policy Details
          </button>
        </div>

        {/* Content Area */}
        <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 space-y-4 sm:space-y-6 min-w-0">

          {/* TAB 0: Real Bot Connection & Setup */}
          {activeTab === 'bot_setup' && (
            <div className="space-y-4 sm:space-y-6 min-w-0">
              {/* Connection Status Banner */}
              <div className={`p-3 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                tgConfig.isConnected 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950' 
                  : 'bg-amber-50 border-amber-200 text-amber-950'
              }`}>
                <div className="flex items-start sm:items-center space-x-2.5 sm:space-x-3 min-w-0">
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    tgConfig.isConnected ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                  }`}>
                    {tgConfig.isConnected ? <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" /> : <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs sm:text-sm truncate">
                      {tgConfig.isConnected 
                        ? `Live Bot Connected: @${tgConfig.botUsername}`
                        : 'No Live Bot Connected (Simulator Mode)'}
                    </h4>
                    <p className="text-[11px] sm:text-xs opacity-90 leading-tight mt-0.5">
                      {tgConfig.isConnected
                        ? `Ready for Staff Group & Mr. Shawn's Direct Alerts.`
                        : 'Follow the steps below to link your free Telegram Bot.'}
                    </p>
                  </div>
                </div>

                {tgConfig.isConnected && (
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                    <button
                      onClick={() => handleSyncGroupMessagesNow(false)}
                      disabled={isSyncingNow}
                      className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] sm:text-xs font-bold shadow-xs flex items-center justify-center transition-colors disabled:opacity-50"
                      title="Instantly check the Telegram Staff group for new duty drops"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                      {isSyncingNow ? 'Checking...' : 'Check Telegram'}
                    </button>
                    <button
                      onClick={() => handleSyncGroupMessagesNow(true)}
                      disabled={isSyncingNow}
                      className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] sm:text-xs font-medium shadow-xs flex items-center justify-center transition-colors disabled:opacity-50"
                      title="Reset offset and re-scan message history from Telegram"
                    >
                      Deep Scan
                    </button>
                    <button
                      onClick={() => handleSendRealTestAlert('group')}
                      disabled={isSendingRealTest}
                      className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] sm:text-xs font-bold shadow-xs flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      {isSendingRealTest ? 'Sending...' : 'Test Send'}
                    </button>
                  </div>
                )}
              </div>

              {/* Step-by-Step Instructions & Credentials Form */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Column: Easy 3-Step Setup Instructions */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3.5">
                    <h5 className="font-bold text-slate-900 text-sm flex items-center">
                      <Sparkles className="w-4 h-4 mr-1.5 text-amber-500" />
                      How to get your Bot Token (Free, 2 Mins)
                    </h5>

                    <div className="space-y-2.5 text-slate-600">
                      <div className="flex items-start space-x-2">
                        <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">1</span>
                        <div>
                          <strong className="text-slate-900 block">Open Telegram & Search @BotFather</strong>
                          <span>Search for official <code className="bg-slate-200 px-1 py-0.5 rounded text-sky-900 font-mono font-bold">@BotFather</code> with the blue checkmark.</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2">
                        <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">2</span>
                        <div>
                          <strong className="text-slate-900 block">Send /newbot command</strong>
                          <span>Give your bot a Name (e.g. <em>APA Duty Outside</em>) and Username ending in 'bot' (e.g. <em>apa_duty_outside_bot</em>).</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2">
                        <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">3</span>
                        <div>
                          <strong className="text-slate-900 block">Copy API Token & Paste Right</strong>
                          <span>BotFather will reply with your token (looks like: <code className="bg-slate-200 px-1 rounded text-slate-800 font-mono">123456789:AAFlv...</code>).</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-2 pt-1 border-t border-slate-200">
                        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">4</span>
                        <div>
                          <strong className="text-amber-950 block">Important: Enable Group Reading</strong>
                          <span>In @BotFather, send <code className="bg-slate-200 px-1 rounded font-mono">/setprivacy</code> &rarr; select your bot &rarr; click <strong>Disable</strong>. This allows the bot to read messages staff post in your Staff Group!</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 text-xs text-sky-950 space-y-1.5">
                    <strong className="font-bold flex items-center text-sky-900">
                      <Smartphone className="w-4 h-4 mr-1 text-sky-700" />
                      How to get Mr. Shawn's Chat ID:
                    </strong>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      Ask Mr. Shawn to search for <code className="bg-sky-100 px-1 rounded font-mono font-bold text-sky-900">@userinfobot</code> in Telegram and tap Start. It will immediately show his numeric Telegram ID (e.g., <span className="font-mono font-semibold">987654321</span>).
                    </p>
                  </div>
                </div>

                {/* Right Column: Interactive Credentials Form */}
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Bot API Configuration</h4>
                      <p className="text-xs text-slate-500">Credentials auto-save to device as you type</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {saveIndicator === 'saved' ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center shadow-xs animate-pulse">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          Saved to device!
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center">
                          <Check className="w-3 h-3 mr-1 text-emerald-600" />
                          Auto-saved
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        Telegram Bot API v7
                      </span>
                    </div>
                  </div>

                  {/* 1. Bot Token Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-800">
                        1. Telegram Bot Token <span className="text-red-500">*</span>
                      </label>
                      {tgConfig.botUsername && (
                        <span className="text-[11px] text-emerald-700 font-semibold flex items-center">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          @{tgConfig.botUsername}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          autoComplete="off"
                          value={inputToken}
                          onChange={(e) => {
                            dirtyFieldsRef.current.token = true;
                            setInputToken(e.target.value);
                          }}
                          placeholder="e.g. 7123456789:AAFlvExampleTokenHereXyZ123"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-mono bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleValidateBotToken}
                        disabled={isValidatingToken}
                        className="px-3.5 py-2 text-xs font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors shrink-0 flex items-center justify-center disabled:opacity-50"
                      >
                        {isValidatingToken ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <Link className="w-3.5 h-3.5 mr-1" />
                        )}
                        Get Group
                      </button>
                    </div>
                    {tokenStatus.message && (
                      <p className={`text-[11px] mt-1.5 flex items-center ${
                        tokenStatus.type === 'success' ? 'text-emerald-700 font-semibold' : 'text-red-600 font-medium'
                      }`}>
                        {tokenStatus.type === 'success' ? <CheckCircle2 className="w-3 h-3 mr-1 shrink-0" /> : <AlertCircle className="w-3 h-3 mr-1 shrink-0" />}
                        {tokenStatus.message}
                      </p>
                    )}
                    {groupPickStatus.message && (
                      <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed flex items-start gap-1.5 ${
                        groupPickStatus.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200/70 text-emerald-800'
                          : 'bg-red-50 border-red-200/70 text-red-700'
                      }`}>
                        {groupPickStatus.type === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        )}
                        <span>{groupPickStatus.message}</span>
                      </div>
                    )}
                    {groupPickerOpen && (
                      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setGroupPickerOpen(false); }}>
                        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                <Users className="w-4 h-4 text-sky-600" /> Select Staff Telegram Group
                              </h3>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Groups your bot has joined — pick the one to link for alerts.
                              </p>
                            </div>
                            <button type="button" onClick={() => setGroupPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500" title="Close">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                            {availableGroups.map((group) => (
                              <li key={group.id}>
                                <button
                                  type="button"
                                  onClick={() => handlePickGroup(group)}
                                  className="w-full text-left px-4 py-3 hover:bg-sky-50 transition-colors flex items-center justify-between gap-3"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                                      <Users className="w-4 h-4" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-800 truncate">{group.title}</p>
                                      {group.username && (
                                        <p className="text-[11px] text-slate-500 font-mono truncate">@{group.username}</p>
                                      )}
                                      <p className="text-[10px] text-slate-400 font-mono truncate">{group.id}</p>
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-[11px] font-semibold text-sky-700 border border-sky-200 bg-sky-50 rounded-lg px-2.5 py-1">
                                    Link this group
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                          {availableGroups.length === 0 && (
                            <div className="px-4 py-6 text-center text-xs text-slate-500">
                              No groups found. Add your bot to your Staff Group in Telegram, then press Get Group again.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Staff Group Chat ID */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      2. Staff Telegram Group Chat ID (or Group @username)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={inputGroupChatId}
                        onChange={(e) => {
                          dirtyFieldsRef.current.group = true;
                          setInputGroupChatId(e.target.value);
                        }}
                        placeholder="e.g. -1001234567890 or @APADutyStaffGroup"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-mono bg-slate-50 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendRealTestAlert('group')}
                        disabled={isSendingRealTest || (!inputToken && !tgConfig.botToken)}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors shrink-0 whitespace-nowrap disabled:opacity-50 text-center"
                        title="Send a sample test message to the group"
                      >
                        Test Group Send
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Tip: Add your bot to your Staff Group as an Administrator, then paste the group ID here.
                    </p>
                    <div className="mt-2 rounded-lg bg-sky-50 border border-sky-200/70 p-2.5 text-[11px] text-sky-900 leading-relaxed">
                      <p className="font-bold text-sky-950 mb-1 flex items-center gap-1">
                        <HelpCircle className="w-3.5 h-3.5 shrink-0" /> How to find the Staff Group Chat ID
                      </p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>
                          Add your bot to the Staff Telegram Group as an <strong>Administrator</strong>.
                        </li>
                        <li>
                          Easiest: if the group has a public link, use its <strong>@username</strong> directly (e.g. <code className="bg-sky-100/80 rounded px-1 font-mono">@APADutyStaffGroup</code>) — no number needed.
                        </li>
                        <li>
                          Private group instead? With your bot already in the group as admin, post any message in the group (or have a staff member post one). Then open in a browser:
                          <code className="block bg-sky-100/70 rounded px-1.5 py-0.5 my-1 font-mono">
                            https://api.telegram.org/bot&lt;YOUR_BOT_TOKEN&gt;/getUpdates
                          </code>
                          and copy the negative number in <code className="bg-sky-100/80 rounded px-1 font-mono">{'"chat":{"id":'}</code> — group IDs start with <code className="bg-sky-100/80 rounded px-1 font-mono">-100</code>. If nothing appears, run <strong>/setprivacy → Disable</strong> for your bot in @BotFather so it can read group messages.
                        </li>
                        <li>
                          Paste it above, then press <strong>Test Group Send</strong> to confirm the message reaches the staff group.
                        </li>
                      </ol>
                    </div>
                  </div>

                  {/* 3. Mr. Shawn's Chat ID */}
                  <div>
                    <label className="block text-xs font-bold text-amber-950 mb-1 flex items-center justify-between flex-wrap gap-1">
                      <span>3. Mr. Shawn's Personal Telegram Chat ID (For Private Alerts)</span>
                      <span className="text-[10px] text-amber-700 font-normal">Confidential 1-on-1</span>
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={inputShawnChatId}
                        onChange={(e) => {
                          dirtyFieldsRef.current.shawn = true;
                          setInputShawnChatId(e.target.value);
                        }}
                        placeholder="e.g. 987654321"
                        className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono bg-amber-50/40 focus:bg-white text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendRealTestAlert('shawn')}
                        disabled={isSendingRealTest || (!inputToken && !tgConfig.botToken)}
                        className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 transition-colors shrink-0 whitespace-nowrap disabled:opacity-50 text-center"
                        title="Send a sample superior alert to Mr. Shawn"
                      >
                        Test Mr. Shawn Alert
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Mr. Shawn must tap <strong>Start</strong> on your bot once so Telegram allows the bot to send him private alerts.
                    </p>
                    <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200/70 p-2.5 text-[11px] text-amber-900 leading-relaxed">
                      <p className="font-bold text-amber-950 mb-1 flex items-center gap-1">
                        <HelpCircle className="w-3.5 h-3.5 shrink-0" /> How to find Mr. Shawn's personal Chat ID
                      </p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>
                          In Mr. Shawn's Telegram, open <strong>@userinfobot</strong> and press <strong>Start</strong>. The bot replies with his personal ID — a number like <code className="bg-amber-100/80 rounded px-1 font-mono">987654321</code>.
                        </li>
                        <li>
                          Alternative: make Mr. Shawn open <strong>your bot</strong> and tap <strong>Start</strong>, then in a browser open:
                          <code className="block bg-amber-100/70 rounded px-1.5 py-0.5 my-1 font-mono">
                            https://api.telegram.org/bot&lt;YOUR_BOT_TOKEN&gt;/getUpdates
                          </code>
                          and copy the number shown in <code className="bg-amber-100/80 rounded px-1 font-mono">{'"chat":{"id":'}</code>.
                        </li>
                        <li>
                          Paste that number above, then press <strong>Test Mr. Shawn Alert</strong> to confirm the private 1-on-1 alert arrives.
                        </li>
                      </ol>
                    </div>
                  </div>

                  {/* Real Test Result Banner */}
                  {realTestResult.message && (
                    <div className={`p-2.5 rounded-lg text-xs font-medium flex items-center ${
                      realTestResult.type === 'success' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' : 'bg-red-100 text-red-900 border border-red-200'
                    }`}>
                      {realTestResult.type === 'success' ? <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0 text-emerald-700" /> : <AlertCircle className="w-4 h-4 mr-1.5 shrink-0 text-red-600" />}
                      {realTestResult.message}
                    </div>
                  )}

                  {/* Save Configuration Button */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500">
                      Credentials auto-saved locally in browser storage.
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveBotSettings}
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors flex items-center justify-center"
                    >
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Save Configuration
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* TAB 1: Template Generator */}
          {activeTab === 'template' && (
            <div className="space-y-5">
              {/* Preset Reason Chips */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-900">
                    Reason or Purpose (Pre-set Options):
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Click an option to automatically configure the Telegram message
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {[
                    { label: 'Go to bank', icon: Landmark, desc: 'Cheques, cash, accounts' },
                    { label: 'Go to GDT', icon: Building2, desc: 'Tax filings & submissions' },
                    { label: 'Go to meet GDT', icon: Users, desc: 'Official tax audits & meetings' },
                    { label: 'Doing CFO tasks', icon: Briefcase, desc: 'Urgent CFO errands' },
                    { label: 'Other', icon: HelpCircle, desc: 'Custom specific purpose' }
                  ].map((item) => {
                    const Icon = item.icon;
                    const isSel = reasonPreset === item.label;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setReasonPreset(item.label)}
                        className={`p-2.5 rounded-lg border text-xs font-medium flex flex-col justify-between transition-all text-left ${
                          isSel
                            ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <Icon className={`w-4 h-4 ${isSel ? 'text-white' : 'text-slate-600'}`} />
                          {isSel && <Check className="w-3.5 h-3.5 text-white font-bold" />}
                        </div>
                        <span className="font-semibold block leading-tight">{item.label}</span>
                        <span className={`text-[10px] mt-0.5 ${isSel ? 'text-sky-100' : 'text-slate-400'}`}>
                          {item.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {reasonPreset === 'Other' && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Specify Custom Reason (Since Reason was not in system list):
                    </label>
                    <input
                      type="text"
                      value={otherReasonText}
                      onChange={(e) => setOtherReasonText(e.target.value)}
                      placeholder="e.g., Customs clearance meeting at airport / Legal document notarization..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Form Quick Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">1. Staff Requester</label>
                  <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">2. Other Staff on Duty (Optional)</label>
                  <input
                    type="text"
                    value={otherStaff}
                    onChange={(e) => setOtherStaff(e.target.value)}
                    placeholder="e.g. Vibol Kim, Chan Dara"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">3. Position</label>
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">7. Departure Time</label>
                  <input
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">8. Return Time Status (Same-Day Policy)</label>
                  <select
                    value={returnStatus}
                    onChange={(e) => setReturnStatus(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-medium"
                  >
                    <option value="pending">Pending (Update upon return today)</option>
                    <option value="fixed">Confirmed Return Time</option>
                    <option value="direct_home">Direct to Home (End of day duty)</option>
                  </select>
                </div>
                {returnStatus === 'fixed' ? (
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">Confirmed Return Time</label>
                    <input
                      type="time"
                      value={fixedReturnTime}
                      onChange={(e) => setFixedReturnTime(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md"
                    />
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-700 font-medium">10. Authorized Approver</label>
                      <span className="text-[10px] bg-slate-200 text-slate-700 font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5 text-slate-500" />
                        Fixed
                      </span>
                    </div>
                    <input
                      type="text"
                      value={approver}
                      readOnly
                      disabled
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-slate-100 text-slate-700 cursor-not-allowed font-medium"
                    />
                  </div>
                )}
              </div>

              {/* Generated Message Display */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center">
                    <Send className="w-3.5 h-3.5 mr-1 text-sky-600" />
                    Exact 10-Item Telegram Message Preview
                  </span>
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-md bg-sky-100 hover:bg-sky-200 text-sky-800 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copy Telegram Text
                      </>
                    )}
                  </button>
                </div>
                <div className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl shadow-inner border border-slate-800 leading-relaxed whitespace-pre-wrap">
                  {generatedTelegramMessage}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between p-4 bg-sky-50 border border-sky-200 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-sky-950">Test Instant Registration</h4>
                  <p className="text-[11px] text-sky-800">
                    Import this Telegram request directly into the database to verify active movement tracking.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('live_chat')}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white hover:bg-sky-100 text-sky-800 border border-sky-300 transition-colors flex items-center"
                  >
                    <Bot className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
                    Open Live Bot Chat
                  </button>
                  <button
                    type="button"
                    hidden
                    onClick={handleSimulateSubmit}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs transition-colors flex items-center"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Direct Register in App
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Live Telegram Bot Simulator */}
          {activeTab === 'live_chat' && (
            <div className="space-y-3.5">
              
              {/* Architecture & Flow Banner */}
              <div className="bg-sky-50/80 border border-sky-200 rounded-xl p-3 text-xs">
                <div className="flex items-center space-x-2 mb-1.5">
                  <Bot className="w-4 h-4 text-sky-700 shrink-0" />
                  <span className="font-bold text-sky-950">
                    Dual Telegram Workflow Architecture
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="bg-white/80 p-2 rounded-lg border border-sky-100 flex items-start space-x-1.5">
                    <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                    <div>
                      <strong className="text-slate-800 block font-semibold">Staff Telegram Group</strong>
                      <span className="text-slate-500">Staff drop requests directly into group chat.</span>
                    </div>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-sky-100 flex items-start space-x-1.5">
                    <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                    <div>
                      <strong className="text-slate-800 block font-semibold">Automatic System Sync</strong>
                      <span className="text-slate-500">Bot records & updates the web database instantly.</span>
                    </div>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-sky-100 flex items-start space-x-1.5">
                    <span className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                    <div>
                      <strong className="text-amber-950 block font-semibold">Mr. Shawn Private Alert</strong>
                      <span className="text-slate-500">Superior receives a 1-on-1 private bot alert.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Channel Selector Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                <div className="grid grid-cols-2 gap-1.5 sm:flex sm:space-x-1 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setChatChannel('group')}
                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center ${
                      chatChannel === 'group'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    <span>Staff Telegram Group</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setChatChannel('shawn_dm');
                      setShawnUnread(0);
                    }}
                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center relative ${
                      chatChannel === 'shawn_dm'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                    <span>Mr. Shawn's Direct Alerts</span>
                    {shawnUnread > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white text-amber-700">
                        {shawnUnread} new
                      </span>
                    )}
                  </button>
                </div>

                {/* Simulation Action Buttons */}
                <div className="flex items-center space-x-1.5 justify-end w-full sm:w-auto">
                  {chatChannel === 'group' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleProcessIncomingChat('pls give me the instruction how to fill')}
                        className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 flex items-center transition-colors"
                        title="Simulate staff asking bot for instructions"
                      >
                        <HelpCircle className="w-3 h-3 mr-1 text-sky-700 shrink-0" />
                        <span className="hidden sm:inline">Ask "How to fill"</span>
                        <span className="sm:hidden">Help Bot</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleTrigger5PMAlert}
                        className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 flex items-center transition-colors"
                        title="Simulate 5:00 PM return reminder alert"
                      >
                        <Bell className="w-3 h-3 mr-1 text-amber-700 shrink-0" />
                        <span className="hidden sm:inline">Simulate 5:00 PM Alert</span>
                        <span className="sm:hidden">5 PM Alert</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSendChatRequest}
                        className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-xs flex items-center transition-colors"
                      >
                        <Send className="w-3 h-3 mr-1 shrink-0" />
                        <span>Drop Staff Request</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleShawnAcknowledge}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-xs flex items-center transition-colors"
                    >
                      <Check className="w-3 h-3 mr-1 shrink-0" />
                      <span>Mr. Shawn Acknowledge</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Chat Sub-Header */}
              <div className="flex items-center justify-between px-3 py-1 text-[11px] text-slate-500">
                {chatChannel === 'group' ? (
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-semibold text-slate-800">APA Duty Outside Staff (Group Chat)</span>
                    <span className="text-slate-400">• Includes Staff, @APA_DutyBot, Mr. Shawn</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="font-semibold text-amber-900">Private 1-on-1: Mr. Shawn ↔ @APA_DutyBot</span>
                    <span className="text-slate-400">• Personal Superior Notifications</span>
                  </div>
                )}
                <span className="text-[10px] text-slate-400">Telegram Bot API v7</span>
              </div>

              {/* Chat Window */}
              <div className="bg-slate-100 rounded-2xl border border-slate-300 p-3 sm:p-4 h-96 overflow-y-auto space-y-3">
                {(chatChannel === 'group' ? chatMessages : shawnMessages).map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] sm:max-w-[85%] rounded-2xl p-3 sm:p-3.5 text-xs shadow-xs space-y-2 ${
                        msg.sender === 'user'
                          ? chatChannel === 'group'
                            ? 'bg-sky-600 text-white rounded-tr-none'
                            : 'bg-amber-600 text-white rounded-tr-none'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 border-b pb-1 border-slate-100">
                        <span className="font-semibold text-slate-600">
                          {msg.sender === 'user' 
                            ? (chatChannel === 'group' ? staffName : 'Mr. Shawn (General Manager)') 
                            : 'APA Duty Bot (@APA_DutyBot)'}
                        </span>
                        <span>{msg.timestamp}</span>
                      </div>

                      <div className="whitespace-pre-wrap leading-relaxed font-sans">
                        {msg.text}
                      </div>

                      {/* Interactive Button Card in Group Chat */}
                      {chatChannel === 'group' && msg.cardData && (
                        <div className="pt-2 mt-2 border-t border-slate-200/80">
                          {msg.cardData.status === 'pending' ? (
                            <div className="space-y-2">
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-[11px] text-amber-900 flex items-center justify-between">
                                <span>Status: <strong>🟡 Currently Outside</strong></span>
                                <span>Dep: {msg.cardData.departure}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleBotTapReturn(msg.cardData!.reqId)}
                                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all transform active:scale-95"
                              >
                                <span>🏢 [ Tap here when Returned to Office ]</span>
                              </button>
                              <p className="text-[10px] text-slate-400 text-center italic">
                                Tapping this records current time & completes your record in compliance with Same-Day Return Policy.
                              </p>
                            </div>
                          ) : (
                            <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-2 text-[11px] text-emerald-900 flex items-center space-x-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <div>
                                <span className="font-bold block">Status: Returned to Office</span>
                                <span className="text-[10px]">Return recorded at {msg.cardData.returnTime}. Record is complete!</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Superior Quick Indicator in Mr. Shawn Feed */}
                      {chatChannel === 'shawn_dm' && msg.cardData && (
                        <div className="pt-2 mt-2 border-t border-slate-200/80">
                          <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-2 text-[11px] text-amber-950 flex items-center justify-between">
                            <span className="font-semibold">Duty Outside Status:</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                              {msg.cardData.status === 'pending' ? 'Active / Outside' : 'Returned'}
                            </span>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                ))}
              </div>

              {/* Chat Input */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && chatInput.trim()) {
                      handleProcessIncomingChat(chatInput);
                      setChatInput('');
                    }
                  }}
                  placeholder={chatChannel === 'group' ? "Type 'how to fill', '/return 15:30', or drop a request..." : "Mr. Shawn private response to Bot..."}
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-sky-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!chatInput.trim()) return;
                    handleProcessIncomingChat(chatInput);
                    setChatInput('');
                  }}
                  className={`p-2 rounded-lg text-white ${chatChannel === 'group' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-amber-600 hover:bg-amber-500'}`}
                >
                  <CornerDownLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Message Parser */}
          {activeTab === 'message_parser' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold text-slate-900">
                    Paste Telegram Message (Automatic 10-Item Parser)
                  </h4>
                  <button
                    type="button"
                    onClick={handleParseMessage}
                    className="px-3 py-1 text-xs font-semibold rounded-md bg-sky-600 hover:bg-sky-500 text-white shadow-xs"
                  >
                    Parse & Validate
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-2">
                  Paste any Telegram message sent by staff to parse the 10 fields and detect the duty reason automatically.
                </p>
                <textarea
                  rows={8}
                  value={rawPastedMessage}
                  onChange={(e) => {
                    setRawPastedMessage(e.target.value);
                    if (e.target.value.trim()) setParseErrorMsg('');
                  }}
                  placeholder={'Paste the staff Telegram message here, e.g.:\n\n1. Requester: Sok Mouy\n2. Staff on Duty: Sok Mouy, Vibol Kim\n3. Position: Senior Accountant\n4. Reason: Go to GDT (Annual Tax Filing Documents)\n7. Departure: 10:15\n8. Return: Pending\n9. Missed Scans: Lunch Out, Lunch In'}
                  className="w-full font-mono text-xs p-3 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {parseErrorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{parseErrorMsg}</span>
                </div>
              )}

              {parseSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{parseSuccessMsg}</span>
                  </div>
                  <button
                    onClick={handleImportParsed}
                    className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-semibold text-xs transition-colors"
                  >
                    Import Record to App
                  </button>
                </div>
              )}

              {parsedPreview && (
                <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                  <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Parsed Fields Preview
                  </h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-slate-400 block text-[10px]">1. Requester</span>
                      <strong className="text-slate-900">{parsedPreview.requesterName}</strong>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-slate-400 block text-[10px]">2. Staff on Duty</span>
                      <strong className="text-slate-900">{parsedPreview.employeesOnDuty?.join(', ')}</strong>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-slate-400 block text-[10px]">3. Position</span>
                      <strong className="text-slate-900">{parsedPreview.position}</strong>
                    </div>
                    <div className="p-2 bg-slate-50 rounded col-span-2 sm:col-span-1">
                      <span className="text-slate-400 block text-[10px]">4. Reason & Category</span>
                      <DutyReasonBadge reason={parsedPreview.reasonOrPurpose || ''} className="mt-0.5" />
                      <div className="text-slate-700 text-[11px] mt-0.5">{parsedPreview.reasonOrPurpose}</div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-slate-400 block text-[10px]">7. Departure</span>
                      <strong className="text-amber-700">{parsedPreview.timeOfDeparture}</strong>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <span className="text-slate-400 block text-[10px]">8. Return Status</span>
                      <strong className={parsedPreview.isReturnPending ? 'text-amber-600' : 'text-emerald-700'}>
                        {parsedPreview.isReturnPending ? 'Pending (Section 4)' : parsedPreview.timeOfReturn}
                      </strong>
                    </div>
                    <div className="p-2 bg-slate-50 rounded col-span-2 sm:col-span-3">
                      <span className="text-slate-400 block text-[10px]">9. Missed Scans (Excused for Odoo Attendance)</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {parsedPreview.missedFingerprintScans && parsedPreview.missedFingerprintScans.length > 0 ? (
                          parsedPreview.missedFingerprintScans.map((s, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[11px] font-semibold border border-blue-200">
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Return Policy Explanation */}
          {activeTab === 'return_policy' && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <div className="flex items-start">
                  <ShieldAlert className="w-5 h-5 text-amber-700 mr-2.5 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-bold text-amber-950 text-sm mb-1">
                      Mandatory Same-Day Return Policy
                    </h3>
                    <p className="text-amber-900">
                      "Staff are not required to have a confirmed return time at the point of submission. 
                      The Time of Return field may be left pending and updated upon returning to the office. 
                      However, staff are required to complete and update this field on the same day of return without fail. 
                      Failure to update the return time will be treated as an incomplete record."
                    </p>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                <h4 className="font-bold text-slate-900 text-sm">How Return Time is Updated via Telegram:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                    <span className="font-bold text-sky-700 block mb-1">Method 1: Interactive Telegram Button</span>
                    <p className="text-slate-600 mb-2">
                      When staff submit their request, the Telegram bot replies with an interactive button:
                    </p>
                    <div className="p-3 bg-sky-900 text-white rounded-lg text-center font-medium shadow-xs">
                      [ 🏢 Tap here when Returned to Office ]
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Upon returning, staff tap the button. The bot logs the exact return time automatically.
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                    <span className="font-bold text-emerald-700 block mb-1">Method 2: Quick Chat Reply</span>
                    <p className="text-slate-600 mb-2">
                      Staff can simply reply to the bot in the Telegram chat or group:
                    </p>
                    <div className="p-3 bg-slate-900 text-emerald-300 font-mono rounded-lg">
                      /return 15:30<br/>
                      <span className="text-slate-400 text-[11px] font-sans">or simply "Back at 3:30 PM"</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      The bot records the time and closes the pending status.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-white">
                <h4 className="font-bold text-slate-900 text-sm mb-2">Why This Protects Staff Attendance:</h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li><strong>Automatic Attendance Reconciliation:</strong> HR knows the staff was away on legitimate business and will not penalize missed fingerprint scans.</li>
                  <li><strong>Avoids "Incomplete Record":</strong> Without a return time recorded, the system flags the absence as unauthorized under attendance policy.</li>
                  <li><strong>Fair & Flexible:</strong> Staff don't have to guess how long a bank line or GDT meeting will take before leaving.</li>
                </ul>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-3 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="text-xs text-slate-500 flex items-center min-w-0">
            <Bot className="w-4 h-4 mr-1.5 text-sky-600 shrink-0" />
            <span className="truncate text-[11px] sm:text-xs">APA Duty Outside Tracker</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white transition-colors shrink-0 shadow-xs flex items-center"
          >
            <X className="w-3.5 h-3.5 mr-1.5" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
