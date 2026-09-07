import java.io.File;
import java.io.IOException;
import org.apache.jmeter.save.SaveService;
import org.apache.jmeter.util.JMeterUtils;
import org.apache.jorphan.collections.HashTree;

/** Official JMeter JMX load check — same API as GUI open/import. */
public class JmxLoadValidator {
    private static void initJMeter() throws IOException {
        String jmeterHome = System.getenv("JMETER_HOME");
        if (jmeterHome == null || jmeterHome.isBlank()) {
            jmeterHome = "/opt/apache-jmeter-5.6.3";
        }
        File home = new File(jmeterHome);
        if (!home.isDirectory()) {
            throw new IllegalStateException("JMETER_HOME not found: " + jmeterHome);
        }
        JMeterUtils.setJMeterHome(home.getAbsolutePath());
        JMeterUtils.loadJMeterProperties(home.getAbsolutePath() + File.separator + "bin"
                + File.separator + "jmeter.properties");
        JMeterUtils.initLocale();
        SaveService.loadProperties();
    }

    public static void main(String[] args) {
        if (args.length != 1) {
            System.err.println("VALIDATION_FAILED: usage: JmxLoadValidator <file.jmx>");
            System.exit(2);
        }
        try {
            initJMeter();
            HashTree tree = SaveService.loadTree(new File(args[0]));
            if (tree == null || tree.size() == 0) {
                System.err.println("VALIDATION_FAILED: empty test plan tree");
                System.exit(1);
            }
            System.out.println("VALIDATION_OK");
            System.exit(0);
        } catch (Throwable t) {
            String msg = t.getMessage();
            if (msg == null || msg.isBlank()) msg = t.getClass().getSimpleName();
            System.err.println("VALIDATION_FAILED: " + msg);
            t.printStackTrace(System.err);
            System.exit(1);
        }
    }
}
