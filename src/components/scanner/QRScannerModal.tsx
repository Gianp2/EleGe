import React, { useState, useEffect, useRef } from 'react';
import { Camera, Keyboard, AlertCircle, Sparkles } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Modal } from '../common/Modal';
import { decodificarQR, QRPayloadDecoded } from '../../utils/qr';
import { storage } from '../../services/storage';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decoded: QRPayloadDecoded, rawCode: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [activeMode, setActiveMode] = useState<'camera' | 'usb'>('camera');
  const [manualInput, setManualInput] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'qr-reader-viewport';

  useEffect(() => {
    let mounted = true;

    if (isOpen && activeMode === 'camera') {
      Html5Qrcode.getCameras()
        .then((devices) => {
          if (!mounted) return;
          if (devices && devices.length) {
            setCameras(devices);
            const backCamera = devices.find((d) =>
              d.label.toLowerCase().includes('back') ||
              d.label.toLowerCase().includes('trasera') ||
              d.label.toLowerCase().includes('environment')
            );
            const chosenId = backCamera ? backCamera.id : devices[0].id;
            setSelectedCameraId(chosenId);
            startCamera(chosenId);
          } else {
            setCameraError('No se detectaron cámaras en este dispositivo. Podés ingresar el código manualmente o con lector USB.');
          }
        })
        .catch((err) => {
          if (!mounted) return;
          console.warn('Error accediendo a cámaras:', err);
          setCameraError('Permiso de cámara no concedido o no disponible en este entorno.');
        });
    } else {
      stopCamera();
    }

    return () => {
      mounted = false;
      stopCamera();
    };
  }, [isOpen, activeMode]);

  const startCamera = async (cameraId: string) => {
    try {
      await stopCamera();
      setCameraError(null);
      const html5QrCode = new Html5Qrcode(scannerContainerId);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleCodeDetected(decodedText);
        },
        () => {
          // Frame sin QR
        }
      );
      setIsScanning(true);
    } catch (err: any) {
      console.warn('Error iniciando escáner:', err);
      setCameraError(err?.message || 'Error al encender la cámara.');
      setIsScanning(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current && isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (e) {
        // Ignorar cleanup errors
      }
      html5QrCodeRef.current = null;
      setIsScanning(false);
    }
  };

  const handleCodeDetected = (rawCode: string) => {
    const decoded = decodificarQR(rawCode);
    if (decoded) {
      stopCamera();
      onClose();
      onScanSuccess(decoded, rawCode);
    } else {
      setCameraError(`Código leído no reconocido: "${rawCode}". Asegurate de escanear un QR de Lavadero eLeGe.`);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleCodeDetected(manualInput.trim());
  };

  const testPrendas = storage.getPedidos().flatMap((p) => p.prendas);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title="Lector QR e Identificador"
      subtitle="Escaneá la etiqueta de la prenda o comprobante de cliente"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Selector de modo: Cámara vs Lector USB / Teclado */}
        <div className="flex p-1 bg-neutral-100 rounded-xl border border-neutral-200">
          <button
            type="button"
            onClick={() => setActiveMode('camera')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeMode === 'camera'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Cámara en Vivo</span>
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveMode('usb');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeMode === 'usb'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>Lector USB / Manual</span>
          </button>
        </div>

        {/* Modo Cámara */}
        {activeMode === 'camera' && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 flex flex-col items-center justify-center min-h-[280px]">
              <div id={scannerContainerId} className="w-full max-w-[340px] overflow-hidden rounded-xl" />
              
              {cameraError && (
                <div className="p-4 text-center max-w-xs space-y-2">
                  <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                  <p className="text-xs text-neutral-700 font-medium">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => setActiveMode('usb')}
                    className="text-xs text-neutral-900 hover:underline font-bold inline-block"
                  >
                    Usar ingreso manual o lector USB
                  </button>
                </div>
              )}
            </div>

            {cameras.length > 1 && (
              <div className="flex items-center justify-between text-xs text-neutral-600 px-1">
                <span>Cámara seleccionada:</span>
                <select
                  value={selectedCameraId}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    startCamera(e.target.value);
                  }}
                  className="bg-white border border-neutral-300 rounded-xl px-2.5 py-1 text-xs text-neutral-900 font-medium shadow-2xs"
                >
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || `Cámara ${c.id.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Modo Lector USB / Entrada Manual */}
        {activeMode === 'usb' && (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-700 leading-relaxed">
              <span className="font-bold text-neutral-900 block mb-1">
                Lector de código de barras USB:
              </span>
              Los lectores de pistola USB funcionan automáticamente al escanear la etiqueta con el cursor en el campo inferior.
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1">
                Código QR o ID de la Prenda / Pedido / Cliente
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Ej: PRN-2401-1, PED-2401 o ELEG:GARMENT:..."
                  className="flex-1 bg-white border border-neutral-300 focus:border-neutral-500 rounded-xl px-3 py-2 text-sm text-neutral-900 font-mono placeholder:text-neutral-400 outline-none shadow-2xs"
                />
                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className="px-4 py-2 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  Buscar
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Acceso Rápido para Pruebas Demo sin Cámara */}
        <div className="pt-3 border-t border-neutral-200 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-neutral-600">
            <span className="flex items-center gap-1 text-neutral-800 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Probar escaneo inmediato (datos demo):
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
            {testPrendas.slice(0, 4).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleCodeDetected(p.qrPayload)}
                className="text-left p-2.5 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 transition-colors group cursor-pointer shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-neutral-900 group-hover:text-amber-700">
                    {p.id}
                  </span>
                  <span className="text-[10px] text-neutral-500 capitalize">{p.estado}</span>
                </div>
                <div className="text-[11px] text-neutral-600 truncate mt-0.5">
                  {p.tipo} - {p.descripcion}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
