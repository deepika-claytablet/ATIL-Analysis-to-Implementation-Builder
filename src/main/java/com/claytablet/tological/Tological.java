package com.claytablet.tological;

import columnfamily.atomic;
import columnfamily.complex;
import columnfamily.containment;
import columnfamily.derived;
import columnfamily.mixed;
import columnfamily.specialized;
import com.claytablet.relational.ATR_Containment;
import com.claytablet.relational.PTR_complex;
import com.claytablet.relational.PTR_specialized;
import com.claytablet.relational.adatToRelations;
import com.claytablet.relational.ATR_Derived;
import com.claytablet.relational.ATR_Mixed;
import com.claytablet.relational.ATR_complex;
import com.claytablet.relational.ATR_specialized;
import com.claytablet.relational.PTR_Containment;
import com.claytablet.relational.panToRelations;
import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.Multimap;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
/**
 *
 * @author dpkap
 */
public class Tological  {
    static File folder = new File(".\\PANCSVFiles");
    static String PanPanFile = ".\\PanPanMultilevel.txt";
    static File Adatfolder = new File(".\\AdatCSVFiles");
    static String analysisPropertyFile = ".\\ISAB.TXT";
    static String AdatAdatFile = ".\\AdatAdatMultilevel.Txt";
    static String ObjectList = ".\\Input.txt";
    static String conversionChoiceFile = ".\\conversionChoice.txt";
    static String outputFilePath = ".\\output.txt";

    public static void initPaths(String schemaDir) {
        File dir = new File(schemaDir);
        folder = new File(dir, "PANCSVFiles");
        PanPanFile = getExistingFilePath(dir, "PanPanMultilevel.txt", "PanPanMultilevel.TXT", "PanPan.txt");
        Adatfolder = new File(dir, "AdatCSVFiles");
        analysisPropertyFile = getExistingFilePath(dir, "ISAB.TXT", "ISAB.txt", "caranalyzedby.txt");
        AdatAdatFile = getExistingFilePath(dir, "AdatAdatMultilevel.Txt", "AdatAdatMultilevel.txt", "AdatAdatMultilevel.TXT");
        ObjectList = getExistingFilePath(dir, "Input.txt", "Input.TXT");
        outputFilePath = new File(dir, "output.txt").getPath();
    }

    private static String getExistingFilePath(File dir, String... candidates) {
        for (String c : candidates) {
            File f = new File(dir, c);
            if (f.exists()) return f.getPath();
        }
        return new File(dir, candidates[0]).getPath();
    }
    
    static Pan panArray[] = new Pan[1000];
    static Adat[] adatArray= new Adat[1000];
    static AdatAttributeRelationships [] analysis_property;
    static MultiLevelAdat mla;
    static MultiLevelPan mlp;
    static AdatRelationships ar;
    static AdatRelationships [] arArray;
    static HashMap<Adat, String> mixedlist = new HashMap<>();
    static HashMap<Adat, String> mixedlist_col = new HashMap<>();
    static String output="";
    
    private static Pan readCsvPan(String fileName){        
        String file= fileName;
        String line;
        String cvsSplitBy = ",";
        Pan p = null;
        String newObject="";
        HashMap<String, String>  attr_changeType = new HashMap<>();
        try (BufferedReader br = new BufferedReader(new FileReader(file))) {
            while ((line = br.readLine()) != null) {
                String[] token = line.split(cvsSplitBy);
                if(token.length==1){
                    newObject = token[0];                    
                    break;
                }
                else
                    attr_changeType.put(token[1], token[2]);
                newObject = token[0];
            }
            if (attr_changeType.isEmpty())
                p = new Pan (newObject, null,null);
            else
                p = new Pan (newObject,attr_changeType, null);
        } catch (IOException e) {
        }
        return  p;
    }
    private static Adat readCsvAdat(String fileName){        
        String file= fileName;         
        String line = "";
        String cvsSplitBy = ",";
        Adat a = null;
        String newObject="";
        String nature="";
        HashMap<String, String>  attr_dataKind = new HashMap<>();
        try (BufferedReader br = new BufferedReader(new FileReader(file))) {
            while ((line = br.readLine()) != null) {
                String[] token = line.split(cvsSplitBy);
                attr_dataKind.put(token[2], token[3]);
                newObject = token[0];
                nature = token[1];
            }
            a = new Adat (newObject,nature,attr_dataKind);
        } catch (IOException e) {
            e.printStackTrace();
        }               
        return  a;
    }
    private static AdatAttributeRelationships [] readCsvAdatAttributeRelationships(String fileAnalyzed){  
        String fileAnalyzedBy=fileAnalyzed;
        String line;
        String cvsSplitBy = ",";
        AdatAttributeRelationships ar ;
        AdatAttributeRelationships [] alarray = new AdatAttributeRelationships[1000] ;
        try (BufferedReader br = new BufferedReader(new FileReader(fileAnalyzedBy))) {
           int i=0;
            while ((line = br.readLine()) != null) {
                ArrayList<String> key = new ArrayList<>();
                HashMap<ArrayList, Boolean>  isAdditive = new HashMap<>();
                HashMap<ArrayList, String>  cardinality = new HashMap<>();
                HashMap<ArrayList, Boolean>  applicability = new HashMap<>();
                String[] token = line.split(cvsSplitBy);
                if (!key.contains(token[0])){
                    key.add(token[0]);
                }             
                key.add(token[1]);
                if (!key.contains(token[2])){
                    key.add(token[2]);
                }
                isAdditive.put(key,Boolean.valueOf(token[3]));
                cardinality.put(key,token[4]);
                applicability.put(key,Boolean.valueOf(token[5]));    
               
                ar = new AdatAttributeRelationships(isAdditive, cardinality, applicability);
                alarray [i] = ar;
                i++;
            }            
        } catch (IOException e) {
        }  
        return  alarray;
    }    
    public static void writefile(String output){
        try (PrintWriter writer = new PrintWriter(new File(outputFilePath))) {
            writer.write(output);
            writer.close();           

        } catch (FileNotFoundException e) {
            System.out.println(e.getMessage());
        }
    }
    private static Multimap<String, String> AdatIsAnalyzedBy(String fileAnalyzed){
        String fileAnalyzedBy=fileAnalyzed;
        String line;
        String cvsSplitBy = ",";
        Multimap<String, String> CSVisAnalyzedBy = ArrayListMultimap.create();
        try (BufferedReader br = new BufferedReader(new FileReader(fileAnalyzedBy))) {
            while ((line = br.readLine()) != null) {
                String[] token = line.split(cvsSplitBy);                
                    CSVisAnalyzedBy.put(token[0], token[2]);
            }
            return CSVisAnalyzedBy;
        }
        catch (IOException e) {
            return null;
        }
    }
    private static void createPan(){
        int i=0;
        if(folder.exists() && folder.listFiles() != null){
            for(final File fileEntry : folder.listFiles()){
                if(fileEntry.isFile()){
                    panArray[i]=readCsvPan(fileEntry.getPath());
                    i++;
                }
            }
        }
        //creating multi-level and specialization PANs
        Multimap<Pan, Pan> Pantree = ArrayListMultimap.create();
        Multimap<Pan, Pan> Pancomplex = ArrayListMultimap.create();
        Multimap<Pan, Pan> Pancontainer = ArrayListMultimap.create();
        String ln;
        File pf = new File(PanPanFile);
        if(pf.exists()){
            try (BufferedReader br = new BufferedReader(new FileReader(pf))) {
                while ((ln = br.readLine()) != null) {
                    if(ln.trim().isEmpty()) continue;
                    String[] token = ln.split(",");
                    if(token.length < 3) continue;
                    if(token[0].equalsIgnoreCase("specialization")){
                        String parent = token[1].trim();
                        String child = token[2].trim();
                       
                        for(Pan p:panArray){
                            if(p != null && p.name.equalsIgnoreCase(parent)){                           
                                for (Pan c:panArray){
                                   if(c != null && c.name.equalsIgnoreCase(child)){
                                      Pantree.put(p, c);
                                      break; 
                                   }
                                }
                                break;
                            }  
                        }
                    }
                    else if(token[0].equalsIgnoreCase("complex")){
                        String complex = token[1].trim();
                        String constituent = token[2].trim();
                       
                        for(Pan p:panArray){
                            if(p != null && p.name.equalsIgnoreCase(complex)){                           
                                for (Pan c:panArray){
                                   if(c != null && c.name.equalsIgnoreCase(constituent)){
                                      Pancomplex.put(p, c);
                                      break; 
                                   }
                                }
                                break;
                            }
                        }
                    }
                    else if(token[0].equalsIgnoreCase("containment") || token[0].equalsIgnoreCase("container")){
                        String container = token[1].trim();
                        String content = token[2].trim();
                       
                        for(Pan p:panArray){
                            if(p != null && p.name.equalsIgnoreCase(container)){                           
                                for (Pan c:panArray){
                                   if(c != null && c.name.equalsIgnoreCase(content)){
                                      Pancontainer.put(p, c);
                                      break; 
                                   }
                                }
                                break;
                            }
                        }
                    }
                }
            }
            catch(FileNotFoundException ffe){
                ffe.printStackTrace();
            }
            catch(IOException ie){
                ie.printStackTrace();
            }
        }
        mlp = new MultiLevelPan(Pantree,Pancomplex, Pancontainer); 
    }

    private static void createAdat(){
        int i=0;
        if(Adatfolder.exists() && Adatfolder.listFiles() != null){
            for(final File fileEntry : Adatfolder.listFiles()){
                if(fileEntry.isFile()){
                    adatArray[i]=readCsvAdat(fileEntry.getPath());
                    i++;
                }
            }
        }     
    
        //create ADAT relationships analysis property of additivity, cardinality, applicability from csv
        File apf = new File(analysisPropertyFile);
        if(apf.exists()){
            analysis_property = readCsvAdatAttributeRelationships(analysisPropertyFile);
        } else {
            analysis_property = new AdatAttributeRelationships[0];
        }
        
        //creating multi-level and specialization PANs
        Multimap<Adat, Adat> Adattree = ArrayListMultimap.create();
        Multimap<Adat, Adat> Adatcomplex = ArrayListMultimap.create();
        Multimap<Adat, Adat> Adatcontainer = ArrayListMultimap.create();
        Multimap<Adat, Adat> ADATderived = ArrayListMultimap.create();
        
        String lne;
        File aaf = new File(AdatAdatFile);
        if(aaf.exists()){
            try (BufferedReader br = new BufferedReader(new FileReader(aaf))) {
                while ((lne = br.readLine()) != null) {
                    if(lne.trim().isEmpty()) continue;
                    String[] token = lne.split(",");
                    if(token.length < 3) continue;
                    if(token[0].equalsIgnoreCase("specialization")){
                        String parent = token[1].trim();
                        String child = token[2].trim();
                       
                        for(Adat p:adatArray){
                            if(p != null && p.name.equalsIgnoreCase(parent)){                           
                                for (Adat c:adatArray){
                                   if(c != null && c.name.equalsIgnoreCase(child)){
                                      Adattree.put(p, c);
                                      break; 
                                   }
                                }
                                break;
                            }  
                        }
                    }
                    else if(token[0].equalsIgnoreCase("complex")){
                        String complex = token[1].trim();
                        String constituent = token[2].trim();
                       
                        for(Adat p:adatArray){
                            if(p != null && p.name.equalsIgnoreCase(complex)){                           
                                for (Adat c:adatArray){
                                   if(c != null && c.name.equalsIgnoreCase(constituent)){
                                      Adatcomplex.put(p, c);
                                      break; 
                                   }
                                }
                                break;
                            }
                        }
                    }
                    else if(token[0].equalsIgnoreCase("containment") || token[0].equalsIgnoreCase("container")){
                        String container = token[1].trim();
                        String content = token[2].trim();
                       
                        for(Adat p:adatArray){
                            if(p != null && p.name.equalsIgnoreCase(container)){                           
                                for (Adat c:adatArray){
                                   if(c != null && c.name.equalsIgnoreCase(content)){
                                      Adatcontainer.put(p, c);
                                      break; 
                                   }
                                }
                                break;
                            }
                        }
                    }
                    else if(token[0].equalsIgnoreCase("derived")){
                        String derived = token[1].trim();
                        String base = token[2].trim();
                       
                        for(Adat p:adatArray){
                            if(p != null && p.name.equalsIgnoreCase(derived)){                           
                                for (Adat c:adatArray){
                                   if(c != null && c.name.equalsIgnoreCase(base)){
                                      ADATderived.put(p, c);
                                      break; 
                                   }
                                }
                                break;
                            }
                        }
                    }
                }
            }
            catch(FileNotFoundException ffe){
                System.out.println("FileNotFoundException: " + AdatAdatFile);
            }
            catch(IOException ie){
                System.out.println("IOException: " + AdatAdatFile);
            }
        }
        mla = new MultiLevelAdat(Adattree, Adatcomplex, Adatcontainer, ADATderived);
        
        //dependency between ADATs
        Multimap<Adat, Adat> dependency = ArrayListMultimap.create(); 
        Multimap<Adat, Pan> isAnalyzedBy = ArrayListMultimap.create();
        if(apf.exists()){
            Multimap<String, String> CSVisAnalyzedBy = AdatIsAnalyzedBy(analysisPropertyFile);
            if(CSVisAnalyzedBy != null){
                for(String key:CSVisAnalyzedBy.keySet() ){
                    for(Adat a : adatArray){
                        if(a != null && key.equalsIgnoreCase(a.getName())){
                            Collection<String> values = CSVisAnalyzedBy.get(key);
                            for(String s : values){
                                for(Pan p:panArray){
                                    if(p != null && s.equalsIgnoreCase(p.getName())){
                                        isAnalyzedBy.put(a, p);
                                        break;
                                    }
                                }
                            }
                            break;     
                        }
                    }
                }
            }
        }
       
        ar = new AdatRelationships(dependency, isAnalyzedBy);
        arArray = new AdatRelationships[1];
        arArray[0] = ar;
    }
    private static void forColumnFamily(){
        //create columns
        String colLine;
        File ol = new File(ObjectList);
        if(!ol.exists()) return;
        try (BufferedReader br = new BufferedReader(new FileReader(ol))) {
            while ((colLine = br.readLine()) != null) {
                if(colLine.trim().isEmpty()) continue;
                String[] token = colLine.split(",");
                if(token.length < 4) continue;
                String type = token[0].trim();
                String name = token[1].trim();
                String linkType = token[2].trim();
                String mixedStatus = token[3].trim();

                if(type.equalsIgnoreCase("adat") && linkType.equalsIgnoreCase("atomic") && mixedStatus.equalsIgnoreCase("notmixed")){
                    for(Adat a:adatArray){
                        if(a != null && a.name.equalsIgnoreCase(name)){
                            columnfamily.atomic ca = new atomic();
                            output = output + "\n"+ca.load(a, arArray,analysis_property,mlp);
                            break;
                        }
                    }
                }
                else if(type.equalsIgnoreCase("adat") && linkType.contains("derived1") && mixedStatus.equalsIgnoreCase("notmixed")){
                    for(Adat a:adatArray){
                        if(a != null && a.name.equalsIgnoreCase(name)){
                            columnfamily.derived ca = new derived();
                            output = output + "\n"+ca.createForderived1(a, arArray, analysis_property, mlp, mla);
                            break;
                        }
                    }
                }
                else if(type.equalsIgnoreCase("adat") && linkType.contains("derived2") && mixedStatus.equalsIgnoreCase("notmixed")){
                    for(Adat a:adatArray){
                        if(a != null && a.name.equalsIgnoreCase(name)){
                            columnfamily.derived ca = new derived();
                            output = output + "\n"+ca.createForderived2(a, arArray, analysis_property, mlp, mla);
                            break;
                        }
                    }
                }
                else if(type.equalsIgnoreCase("adat") && (linkType.contains("containment") || linkType.contains("container")) && mixedStatus.equalsIgnoreCase("notmixed")){
                    for(Adat a:adatArray){
                        if(a != null && a.name.equalsIgnoreCase(name)){
                            columnfamily.containment ca = new containment();
                            output = output + "\n"+ca.createForContainer(a, arArray, analysis_property, mlp, mla);
                            break;
                        }
                    }
                }
                else if(type.equalsIgnoreCase("adat") && linkType.contains("specialization") && mixedStatus.equalsIgnoreCase("notmixed")){
                    for(Adat a:adatArray){
                        if(a != null && a.name.equalsIgnoreCase(name)){
                            columnfamily.specialized ca = new specialized();
                            output = output + "\n"+ca.createForspecialized(a, arArray, analysis_property, mlp, mla);
                            break;
                        }
                    }
                }
                else if(type.equalsIgnoreCase("adat") && linkType.contains("complex") && mixedStatus.equalsIgnoreCase("notmixed")){
                    for(Adat a:adatArray){
                        if(a != null && a.name.equalsIgnoreCase(name)){
                            columnfamily.complex ca = new complex();
                            output = output + "\n"+ca.createForComplex(a, arArray, analysis_property, mlp, mla);
                            break;
                        }
                    }
                }
                else if(type.equalsIgnoreCase("adat") && mixedStatus.equalsIgnoreCase("mixed")){
                    for(Adat a:adatArray){
                        if(a != null && a.name.equalsIgnoreCase(name)){
                            mixedlist_col.put(a, linkType);                                
                            break;
                        }
                    }
                }
            }
            if(!mixedlist_col.isEmpty()){                
                columnfamily.mixed ca = new mixed();
                output = output + "\n"+ ca.createMixed(mixedlist_col, mla, analysis_property, arArray, mlp);
            } 
        }
        catch(FileNotFoundException ffe){
            
        }
        catch(IOException ie){
            
        }
    }
    private static void forStarRelational(){
        //Create relations
        String line;
        File ol = new File(ObjectList);
        if(!ol.exists()) return;
        try (BufferedReader br = new BufferedReader(new FileReader(ol))) {
            while ((line = br.readLine()) != null) {
                if(line.trim().isEmpty()) continue;
                String[] token = line.split(",");
                if(token.length < 3) continue;
                String type = token[0].trim();
                String name = token[1].trim();
                String linkType = token[2].trim();

                if(type.equalsIgnoreCase("pan")){
                    String panName = name;           
                   
                    for(Pan p:panArray){
                        if(p != null && p.name.equalsIgnoreCase(panName)){                           
                            if(linkType.equalsIgnoreCase("atomic")){
                               panToRelations pr = new panToRelations(p);
                               output = output + "\n"+ pr.createRelation(p);
                               break;
                            }
                            else if(linkType.equalsIgnoreCase("specialization1") || linkType.equalsIgnoreCase("specialization")){
                                PTR_specialized pr = new PTR_specialized(p);
                                output = output + "\n"+pr.createSpecializedLevelCase1(p, mlp);
                                 break;
                            }
                            else if(linkType.equalsIgnoreCase("specialization2")){
                                PTR_specialized pr = new PTR_specialized(p);
                                output = output + "\n"+ pr.createSpecializedLevelCase2(p, mlp);
                                 break;
                            }
                            else if(linkType.equalsIgnoreCase("specialization3")){
                                PTR_specialized pr = new PTR_specialized(p);
                                output = output + "\n"+pr.createSpecializedLevelCase3(p, mlp);
                                 break;
                            }
                            else if(linkType.equalsIgnoreCase("containment") || linkType.equalsIgnoreCase("container")){
                                PTR_Containment pr = new PTR_Containment(p);
                                output = output + "\n"+ pr.createContentForContainer(mlp, p, analysis_property);
                                break;
                            }
                            else if(linkType.equalsIgnoreCase("complex")){
                                PTR_complex pr = new PTR_complex(p);
                                output = output + "\n"+ pr.createComplexLevel(mlp);
                                break;
                            }
                        }
                    }
                }
                else if(type.equalsIgnoreCase("adat")){
                    String adatName = name;
                    String mixedStatus = token.length >= 4 ? token[3].trim() : "notmixed";
                    for(Adat a:adatArray){
                        if(a != null && a.name.equalsIgnoreCase(adatName)){
                            if(linkType.equalsIgnoreCase("atomic") && mixedStatus.equalsIgnoreCase("notmixed")){
                                adatToRelations arl = new adatToRelations(a);
                                output = output + "\n"+arl.createRelation(a) + arl.createRelationships(a,arArray)
                                        + arl.createAnalysisProperty(a,analysis_property)+ arl.createDependent(a, arArray);
                                 break;
                            }
                            else if(linkType.equalsIgnoreCase("specialization") && mixedStatus.equalsIgnoreCase("notmixed")){
                                ATR_specialized arl = new ATR_specialized(a);
                                output = output + "\n"+arl.createSpecializedLevel(mla, analysis_property, arArray);
                                 break;
                            }
                            else if((linkType.equalsIgnoreCase("containment") || linkType.equalsIgnoreCase("container")) && mixedStatus.equalsIgnoreCase("notmixed")){
                                ATR_Containment arl = new ATR_Containment(a);
                                output = output + "\n"+ arl.createForContent(mla, a, analysis_property, arArray);
                                 break;
                            }
                            else if((linkType.equalsIgnoreCase("derived1") || linkType.equalsIgnoreCase("derived2") || linkType.equalsIgnoreCase("derived")) && mixedStatus.equalsIgnoreCase("notmixed")){
                                ATR_Derived arl = new ATR_Derived(a);
                                output = output + "\n"+arl.createDerived(a, mla, analysis_property, arArray);
                                 break;
                            }
                            else if(linkType.equalsIgnoreCase("complex1") && mixedStatus.equalsIgnoreCase("notmixed")){
                                ATR_complex arl = new ATR_complex(a);
                                output = output + "\n"+arl.createComplexCase1(a, mla, analysis_property, arArray);
                                break;
                            }
                            else if(linkType.equalsIgnoreCase("complex2") && mixedStatus.equalsIgnoreCase("notmixed")){
                                ATR_complex arl = new ATR_complex(a);
                                output = output + "\n"+arl.createComplexCase2(a, mla, analysis_property, arArray);
                                break;
                            }
                            else if(mixedStatus.equalsIgnoreCase("mixed")){                                
                                mixedlist.put(a, linkType);                                
                                break;
                            }
                        }
                    }
                }                
            }
            if(!mixedlist.isEmpty()){
                Adat a = new Adat();
                ATR_Mixed arm = new ATR_Mixed(a);
                output = output + "\n"+arm.createMixed(mixedlist, mla, analysis_property, arArray);
            }
        }
        catch(FileNotFoundException ffe){
            
        }
        catch(IOException ie){
            
        }
    }
    
    public static void main(String[] args) {
        String schemaDir = ".";
        String choice = "starrelational";

        if(args.length > 0 && !args[0].trim().isEmpty()){
            schemaDir = args[0].trim();
        }
        if(args.length > 1 && !args[1].trim().isEmpty()){
            choice = args[1].trim().toLowerCase();
        }

        initPaths(schemaDir);

        panArray = new Pan[1000];
        adatArray = new Adat[1000];
        mixedlist = new HashMap<>();
        mixedlist_col = new HashMap<>();
        output = "";
        adatToRelations.analysis_property = true;
        adatToRelations.dependentAdat = true;
        adatToRelations.createdBridgeTables.clear();

        //creating Pan from csv (in the form Pan,attribute, change type)
        createPan();        
        //create ADAT from csv (in the form Adat,nature,attribute,data kind)
        createAdat();

        if (args.length > 1) {
            if(choice.contains("relational") || choice.contains("star")) {
                forStarRelational();
            } else if(choice.contains("column") || choice.contains("cf") || choice.contains("hbase") || choice.contains("cassandra")) {
                forColumnFamily();
            } else {
                forStarRelational();
            }
        } else {
            // Check conversionChoiceFile if present
            File ccf = new File(conversionChoiceFile);
            if(ccf.exists()){
                try (BufferedReader br = new BufferedReader(new FileReader(ccf))) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        String[] token = line.split(",");
                        if(token[0].equalsIgnoreCase("starrelational") && token[1].equals("1"))
                            forStarRelational();
                        else if(token[0].contains("column") && token[1].equals("1"))
                            forColumnFamily();
                    }
                }
                catch (IOException e){
                }
            } else {
                forStarRelational();
            }
        }

        writefile(output);
        System.out.print(output);
    }
}
