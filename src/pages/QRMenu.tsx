import React from 'react';
import { QrCode, MessageSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QRCodeSettings from '@/components/QRCodeSettings';
import FeedbackQRSettings from '@/components/FeedbackQRSettings';

/**
 * QR Menu Page
 * Two tabs: Menu QR (existing) and Feedback QR (add-on)
 */
const QRMenu: React.FC = () => {
    return (
        <div className="container mx-auto py-4 px-4 max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
                    <QrCode className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight">QR Codes</h1>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                        Menu QR and Feedback QR for your customers
                    </p>
                </div>
            </div>

            <Tabs defaultValue="menu" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="menu" className="text-xs sm:text-sm">
                        <QrCode className="w-3.5 h-3.5 mr-1.5" /> Menu QR
                    </TabsTrigger>
                    <TabsTrigger value="feedback" className="text-xs sm:text-sm">
                        <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Feedback QR
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="menu" className="mt-0">
                    <QRCodeSettings />
                </TabsContent>
                <TabsContent value="feedback" className="mt-0">
                    <FeedbackQRSettings />
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default QRMenu;
