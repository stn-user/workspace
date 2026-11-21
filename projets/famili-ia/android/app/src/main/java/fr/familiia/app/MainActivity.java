package fr.familiia.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleDriveAuthorizationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
