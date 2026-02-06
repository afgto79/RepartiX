import { useState, useRef } from 'react';
import { Card } from '@tremor/react';
import { api, UploadResponse, ScanResponse } from '../services/api';

export function UploadZone() {
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setUploading(true);
    setUploadResult(null);
    setScanResult(null);
    setErrorMsg(null);

    try {
      const res = await api.uploadPDFs(fileArray);
      setUploadResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleScan() {
    setScanning(true);
    setUploadResult(null);
    setScanResult(null);
    setErrorMsg(null);

    try {
      const res = await api.scanFolder();
      setScanResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setScanning(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Import de releves</h1>
      <p className="text-gray-500 mb-6">Importez les PDFs de releves de decades Alliance Healthcare</p>

      {/* Zone drag & drop */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors mb-6
          ${dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          onChange={e => handleFiles(e.target.files)}
          className="hidden"
        />

        <div className="text-gray-600">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-lg mb-2">Glissez-deposez vos fichiers PDF ici</p>
          <p className="text-sm text-gray-400">ou cliquez pour selectionner (max 50 fichiers)</p>
        </div>
      </div>

      {/* Bouton scan dossier reseau */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Scan dossier reseau</h3>
            <p className="text-sm text-gray-500">Scanner automatiquement le dossier partage</p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {scanning ? 'Scan en cours...' : 'Scanner'}
          </button>
        </div>
      </Card>

      {/* Indicateur de chargement */}
      {(uploading || scanning) && (
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <p className="text-blue-700 text-center">
            {uploading ? 'Import en cours...' : 'Scan du dossier en cours...'}
          </p>
        </Card>
      )}

      {/* Erreur globale */}
      {errorMsg && (
        <Card className="mb-6 bg-red-50 border-red-200">
          <p className="text-red-700">Erreur: {errorMsg}</p>
        </Card>
      )}

      {/* Resultat upload */}
      {uploadResult && (
        <Card className="mb-6">
          <h3 className="font-bold mb-4">Resultats de l'import</h3>

          {uploadResult.imported > 0 && (
            <p className="text-green-600 mb-2">
              {uploadResult.imported} fichier(s) importe(s)
            </p>
          )}
          {uploadResult.duplicates > 0 && (
            <p className="text-yellow-600 mb-2">
              {uploadResult.duplicates} doublon(s) ignore(s)
            </p>
          )}
          {uploadResult.errors.length > 0 && (
            <div className="mt-2">
              <p className="font-semibold text-red-600 mb-1">Erreurs :</p>
              <ul className="list-disc pl-5 space-y-1">
                {uploadResult.errors.map((err, i) => (
                  <li key={i} className="text-sm text-red-600">
                    <span className="font-medium">{err.file}</span>: {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {uploadResult.imported === 0 && uploadResult.duplicates === 0 && uploadResult.errors.length === 0 && (
            <p className="text-gray-500">Aucun fichier traite</p>
          )}
        </Card>
      )}

      {/* Resultat scan */}
      {scanResult && (
        <Card className="mb-6">
          <h3 className="font-bold mb-4">Resultats du scan</h3>
          <p className="text-gray-600 mb-2">{scanResult.scanned} fichier(s) scanne(s)</p>
          {scanResult.new > 0 && (
            <p className="text-green-600 mb-2">{scanResult.new} nouveau(x) importe(s)</p>
          )}
          {scanResult.duplicates > 0 && (
            <p className="text-yellow-600 mb-2">{scanResult.duplicates} doublon(s) ignore(s)</p>
          )}
          {scanResult.errors.length > 0 && (
            <div className="mt-2">
              <p className="font-semibold text-red-600 mb-1">Erreurs :</p>
              <ul className="list-disc pl-5 space-y-1">
                {scanResult.errors.map((err, i) => (
                  <li key={i} className="text-sm text-red-600">
                    <span className="font-medium">{err.file}</span>: {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
